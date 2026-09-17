import json
from datetime import datetime
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from models import SourceDocumentDB, SourceFragmentDB, PatientDB, EncounterDB
from storage import storage_client

class OCRAdapter:
    """
    Adapter for current-encounter OCR JSON (e.g. tesseract prescriptions).
    Extracts text blocks with bounding boxes and archives raw input in MinIO.
    """

    @staticmethod
    def process(payload: Dict[str, Any], db: Session) -> Tuple[SourceDocumentDB, List[SourceFragmentDB]]:
        doc_id = payload.get("document_id") or f"OCR-{int(datetime.utcnow().timestamp())}"
        encounter_id = payload.get("encounter_id")
        patient_session_ref = payload.get("patient_session_ref")
        capture_timestamp_str = payload.get("capture_timestamp") or datetime.utcnow().isoformat()
        try:
            capture_timestamp = datetime.fromisoformat(capture_timestamp_str.replace("Z", "+00:00"))
        except Exception:
            capture_timestamp = datetime.utcnow()

        overall_conf = float(payload.get("overall_ocr_confidence", 1.0))
        document_class = payload.get("document_class", "prescription")
        raw_text = payload.get("raw_text_concatenated", "")

        # 1. Store immutable raw fragment in MinIO
        minio_path, sha256 = storage_client.store_raw_payload("OCR", doc_id, payload)

        # 2. Check / create patient & encounter stub
        patient_id = None
        if patient_session_ref:
            patient = db.query(PatientDB).filter(PatientDB.id == patient_session_ref).first()
            if not patient:
                patient = PatientDB(
                    id=patient_session_ref,
                    name="Rohan Sharma", # from OCR demo block
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

        # 3. Create or update SourceDocument
        doc = db.query(SourceDocumentDB).filter(SourceDocumentDB.id == doc_id).first()
        if not doc:
            doc = SourceDocumentDB(
                id=doc_id,
                source_type="OCR",
                encounter_id=encounter_id,
                patient_id=patient_id,
                patient_session_ref=patient_session_ref,
                document_class=document_class,
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

        # 4. Create SourceFragment records for OCR blocks
        fragments = []
        blocks = payload.get("blocks", [])
        for idx, blk in enumerate(blocks):
            frag_id = f"FRAG-{doc_id}-{blk.get('block_id', idx)}"
            frag = db.query(SourceFragmentDB).filter(SourceFragmentDB.id == frag_id).first()
            bbox = blk.get("bounding_box", {})
            bbox["page"] = blk.get("page", 1)
            if not frag:
                frag = SourceFragmentDB(
                    id=frag_id,
                    document_id=doc_id,
                    fragment_index=idx,
                    original_text=blk.get("text", ""),
                    confidence=float(blk.get("confidence", 1.0)),
                    bounding_box=json.dumps(bbox)
                )
                db.add(frag)
            fragments.append(frag)

        db.commit()
        db.refresh(doc)
        return doc, fragments
