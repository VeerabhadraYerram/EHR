import os
import sys
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from fusion_models import (
    TimelineItem, PatientTimelineResponse, NarrativeSection, FusedNarrativeResponse
)
from services.ingestion.models import PatientDB, SourceDocumentDB, SourceFragmentDB

class ClinicalFusionEngine:
    """
    Production Text Normalization & Source Fusion Engine.
    Aggregates multi-modal clinical text fragments into a unified chronological patient timeline
    and synthesizes a coherent working clinical narrative while strictly enforcing safety quarantine.
    """

    ALLOWED_STATUSES = {"INGESTED", "LINKED", "PROCESSED"}

    @staticmethod
    def normalize_clinical_text(text: Optional[str]) -> str:
        """Normalizes clinical text: unifies line breaks, strips repeated whitespace and edge noise."""
        if not text:
            return ""
        # Unify linebreaks
        t = text.replace("\r\n", "\n").replace("\r", "\n")
        # Remove multiple empty lines
        t = re.sub(r"\n\s*\n+", "\n\n", t)
        # Strip excessive spaces per line
        lines = [re.sub(r"[ \t]+", " ", l.strip()) for l in t.split("\n")]
        return "\n".join(lines).strip()

    def build_patient_timeline(self, patient_id: str, db: Session) -> PatientTimelineResponse:
        patient = db.query(PatientDB).filter_by(id=patient_id).first()
        if not patient:
            raise ValueError(f"Patient with ID {patient_id} not found.")

        # STRICT SAFETY RULE: Only include cleared, linked documents
        docs = (
            db.query(SourceDocumentDB)
            .filter(SourceDocumentDB.patient_id == patient_id)
            .filter(SourceDocumentDB.status.in_(self.ALLOWED_STATUSES))
            .order_by(SourceDocumentDB.capture_timestamp.asc())
            .all()
        )

        timeline_items: List[TimelineItem] = []

        for doc in docs:
            norm_text = self.normalize_clinical_text(doc.raw_text)
            facility = doc.originating_facility_name or "General Hospital Network"
            doc_class = (doc.document_class or "Clinical Document").replace("_", " ").title()

            # Formulate descriptive title based on source
            if doc.source_type == "SPEECH_TO_TEXT":
                title = f"Doctor-Patient Consultation Audio ({facility})"
            elif doc.source_type == "HL7_API_JSON":
                title = f"HL7 Observation / Diagnostic Report ({facility})"
            elif doc.source_type == "HISTORICAL_DOCUMENT" or doc.origin != "current_encounter":
                title = f"External Historical Record: {doc_class} ({facility})"
            else:
                title = f"{doc_class} ({facility})"

            timeline_items.append(
                TimelineItem(
                    id=f"TL-{doc.id}",
                    document_id=doc.id,
                    source_type=doc.source_type,
                    timestamp=doc.capture_timestamp or doc.created_at,
                    facility=facility,
                    title=title,
                    text_content=norm_text,
                    confidence=doc.overall_confidence or 1.0,
                    sha256_checksum=doc.sha256_checksum,
                    minio_path=doc.minio_raw_path,
                    status=doc.status,
                    metadata={
                        "origin": doc.origin,
                        "document_class": doc.document_class,
                        "fragment_count": len(doc.fragments) if doc.fragments else 0
                    }
                )
            )

        # Sort strictly chronologically by timestamp (ascending)
        timeline_items.sort(key=lambda x: x.timestamp)

        return PatientTimelineResponse(
            patient_id=patient.id,
            patient_name=patient.name,
            mrn=patient.mrn,
            total_sources=len(timeline_items),
            timeline=timeline_items
        )

    def synthesize_working_narrative(self, patient_id: str, db: Session) -> FusedNarrativeResponse:
        timeline_res = self.build_patient_timeline(patient_id, db)

        encounter_notes: List[str] = []
        encounter_sources: List[str] = []

        diagnostic_notes: List[str] = []
        diagnostic_sources: List[str] = []

        historical_notes: List[str] = []
        historical_sources: List[str] = []

        for item in timeline_res.timeline:
            date_str = item.timestamp.strftime("%d %b %Y, %H:%M UTC")
            provenance_tag = f"[{item.source_type} | Facility: {item.facility} | Date: {date_str} | SHA256: {item.sha256_checksum[:12]}...]"

            if item.source_type == "SPEECH_TO_TEXT" or item.metadata.get("origin") == "current_encounter":
                encounter_notes.append(f"{provenance_tag}\n{item.text_content}")
                encounter_sources.append(item.document_id)
            elif item.source_type == "HL7_API_JSON" or "lab" in item.title.lower() or "diagnostic" in item.title.lower():
                diagnostic_notes.append(f"{provenance_tag}\n{item.text_content}")
                diagnostic_sources.append(item.document_id)
            else:
                historical_notes.append(f"{provenance_tag}\n{item.text_content}")
                historical_sources.append(item.document_id)

        sections: List[NarrativeSection] = []

        if encounter_notes:
            sections.append(
                NarrativeSection(
                    section_name="Active Consultation & Encounter Narrative",
                    text="\n\n---\n\n".join(encounter_notes),
                    sources_cited=encounter_sources
                )
            )

        if diagnostic_notes:
            sections.append(
                NarrativeSection(
                    section_name="Diagnostic, Laboratory & Procedural Observations",
                    text="\n\n---\n\n".join(diagnostic_notes),
                    sources_cited=diagnostic_sources
                )
            )

        if historical_notes:
            sections.append(
                NarrativeSection(
                    section_name="Reconciled External & Historical Precedents",
                    text="\n\n---\n\n".join(historical_notes),
                    sources_cited=historical_sources
                )
            )

        # Build full synthesized document
        full_narrative_parts = [
            f"# Unified Clinical Narrative - Patient: {timeline_res.patient_name} (MRN: {timeline_res.mrn or 'N/A'})",
            f"Synthesized on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
            f"Verified Ingested Sources: {len(timeline_res.timeline)}\n"
        ]

        for s in sections:
            full_narrative_parts.append(f"## {s.section_name}\n\n{s.text}\n")

        sources_summary = [
            {
                "document_id": it.document_id,
                "source_type": it.source_type,
                "facility": it.facility,
                "timestamp": it.timestamp.isoformat(),
                "sha256": it.sha256_checksum,
                "minio_path": it.minio_path
            }
            for it in timeline_res.timeline
        ]

        return FusedNarrativeResponse(
            patient_id=timeline_res.patient_id,
            patient_name=timeline_res.patient_name,
            mrn=timeline_res.mrn,
            generated_at=datetime.utcnow(),
            working_narrative="\n".join(full_narrative_parts),
            sections=sections,
            sources_included=sources_summary
        )
