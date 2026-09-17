import json
from datetime import datetime
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from models import SourceDocumentDB, SourceFragmentDB
from storage import storage_client

class HistoricalAdapter:
    """
    Adapter for Historical / External Documents from other doctors or external hospitals.
    Extracts identity hints and flags the record as PENDING_IDENTITY_RESOLUTION.
    Strictly adheres to Architecture Document Section 4.3 (no merging before identity matching).
    """

    @staticmethod
    def process(payload: Dict[str, Any], db: Session) -> Tuple[SourceDocumentDB, List[SourceFragmentDB]]:
        doc_id = payload.get("document_id") or f"HIST-{int(datetime.utcnow().timestamp())}"
        origin = payload.get("origin", "external_hospital")
        facility_name = payload.get("originating_facility_name", "Unknown Facility")
        document_class = payload.get("document_class", "historical_discharge_summary")
        capture_timestamp_str = payload.get("capture_timestamp") or datetime.utcnow().isoformat()
        try:
            capture_timestamp = datetime.fromisoformat(capture_timestamp_str.replace("Z", "+00:00"))
        except Exception:
            capture_timestamp = datetime.utcnow()

        overall_conf = float(payload.get("overall_ocr_confidence", 0.8))
        identity_hints = payload.get("identity_hint_fields", {})
        raw_text = payload.get("raw_text_concatenated", "")

        # 1. Store immutable raw payload in MinIO
        minio_path, sha256 = storage_client.store_raw_payload("HISTORICAL_DOCUMENT", doc_id, payload)

        # 2. Create SourceDocument with PENDING_IDENTITY_RESOLUTION status
        # Note: encounter_id and patient_id remain UNATTACHED at ingestion time per Architecture Sec 4.3
        doc = db.query(SourceDocumentDB).filter(SourceDocumentDB.id == doc_id).first()
        if not doc:
            doc = SourceDocumentDB(
                id=doc_id,
                source_type="HISTORICAL_DOCUMENT",
                encounter_id=None,
                patient_id=None,
                patient_session_ref=None,
                document_class=document_class,
                origin=origin,
                originating_facility_name=facility_name,
                capture_timestamp=capture_timestamp,
                minio_raw_path=minio_path,
                sha256_checksum=sha256,
                overall_confidence=overall_conf,
                status="PENDING_IDENTITY_RESOLUTION",
                identity_hint_fields=json.dumps(identity_hints),
                raw_text=raw_text
            )
            db.add(doc)
            db.flush()

        # 3. Create SourceFragments
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
