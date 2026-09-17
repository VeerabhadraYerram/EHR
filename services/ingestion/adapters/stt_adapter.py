import json
from datetime import datetime
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from models import SourceDocumentDB, SourceFragmentDB, PatientDB, EncounterDB
from storage import storage_client

class STTAdapter:
    """
    Adapter for Speech-to-Text Ingestion (e.g., whisper-large-v3 diarized JSON).
    Normalizes input into canonical envelopes and archives raw payloads in MinIO.
    """

    @staticmethod
    def process(payload: Dict[str, Any], db: Session) -> Tuple[SourceDocumentDB, List[SourceFragmentDB]]:
        doc_id = payload.get("transcript_id") or f"STT-{int(datetime.utcnow().timestamp())}"
        encounter_id = payload.get("encounter_id")
        patient_session_ref = payload.get("patient_session_ref")
        capture_timestamp_str = payload.get("capture_start") or datetime.utcnow().isoformat()
        try:
            capture_timestamp = datetime.fromisoformat(capture_timestamp_str.replace("Z", "+00:00"))
        except Exception:
            capture_timestamp = datetime.utcnow()

        overall_conf = float(payload.get("overall_confidence", 1.0))
        raw_text = payload.get("raw_transcript_concatenated", "")

        # 1. Store immutable raw fragment in MinIO
        minio_path, sha256 = storage_client.store_raw_payload("SPEECH_TO_TEXT", doc_id, payload)

        # 2. Check / create patient & encounter stub if needed for session binding
        patient_id = None
        if patient_session_ref:
            patient = db.query(PatientDB).filter(PatientDB.id == patient_session_ref).first()
            if not patient:
                patient = PatientDB(
                    id=patient_session_ref,
                    name="Active Patient Session",
                    created_at=datetime.utcnow()
                )
                db.add(patient)
                db.flush()
            patient_id = patient.id

        if encounter_id:
            enc = db.query(EncounterDB).filter(EncounterDB.id == encounter_id).first()
            if not enc:
                enc = EncounterDB(
                    id=encounter_id,
                    patient_id=patient_id or "UNKNOWN",
                    patient_session_ref=patient_session_ref,
                    start_time=capture_timestamp
                )
                db.add(enc)
                db.flush()

        # 3. Create or update SourceDocument record
        doc = db.query(SourceDocumentDB).filter(SourceDocumentDB.id == doc_id).first()
        if not doc:
            doc = SourceDocumentDB(
                id=doc_id,
                source_type="SPEECH_TO_TEXT",
                encounter_id=encounter_id,
                patient_id=patient_id,
                patient_session_ref=patient_session_ref,
                document_class="transcript",
                origin="current_encounter",
                capture_timestamp=capture_timestamp,
                minio_raw_path=minio_path,
                sha256_checksum=sha256,
                overall_confidence=overall_conf,
                status="INGESTED",
                raw_text=raw_text
            )
            db.add(doc)
            db.flush()

        # 4. Create SourceFragment records
        fragments = []
        segments = payload.get("segments", [])
        for idx, seg in enumerate(segments):
            frag_id = f"FRAG-{doc_id}-{seg.get('segment_id', idx)}"
            frag = db.query(SourceFragmentDB).filter(SourceFragmentDB.id == frag_id).first()
            if not frag:
                frag = SourceFragmentDB(
                    id=frag_id,
                    document_id=doc_id,
                    fragment_index=idx,
                    original_text=seg.get("text", ""),
                    speaker=seg.get("speaker"),
                    confidence=float(seg.get("confidence", 1.0)),
                    start_ms=seg.get("start_ms"),
                    end_ms=seg.get("end_ms")
                )
                db.add(frag)
            fragments.append(frag)

        db.commit()
        db.refresh(doc)
        return doc, fragments
