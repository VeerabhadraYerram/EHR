import json
from datetime import datetime
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from models import SourceDocumentDB, SourceFragmentDB, PatientDB, EncounterDB
from storage import storage_client

class HL7APIAdapter:
    """
    Adapter for HL7-format API JSON (Labs, Prescriptions, Clinical Notes).
    Normalizes FHIR/HL7 collection bundles, links Patient/Encounter, archives raw payload in MinIO,
    and breaks down resources into auditable source fragments.
    """

    @staticmethod
    def process(payload: Dict[str, Any], db: Session) -> Tuple[SourceDocumentDB, List[SourceFragmentDB]]:
        msg_id = payload.get("message_id") or f"HL7API-{int(datetime.utcnow().timestamp())}"
        source_system = payload.get("source_system", "External System")
        encounter_id = payload.get("encounter_id")
        received_timestamp_str = payload.get("received_timestamp") or datetime.utcnow().isoformat()
        try:
            received_timestamp = datetime.fromisoformat(received_timestamp_str.replace("Z", "+00:00"))
        except Exception:
            received_timestamp = datetime.utcnow()

        patient_info = payload.get("patient_identifiers", {})
        mrn = patient_info.get("mrn")
        name = patient_info.get("name", "Unknown Patient")
        dob = patient_info.get("dob")
        gender = patient_info.get("gender")

        # 1. Store immutable raw fragment in MinIO
        minio_path, sha256 = storage_client.store_raw_payload("HL7_API_JSON", msg_id, payload)

        # 2. Check or create PatientDB
        patient = None
        if mrn:
            patient = db.query(PatientDB).filter(PatientDB.mrn == mrn).first()
        if not patient:
            patient_id = f"PT-{mrn}" if mrn else f"PT-{int(datetime.utcnow().timestamp())}"
            patient = PatientDB(
                id=patient_id,
                mrn=mrn,
                name=name,
                dob=dob,
                gender=gender,
                created_at=datetime.utcnow()
            )
            db.add(patient)
            db.flush()
        else:
            # Update missing attributes if available
            if dob and not patient.dob:
                patient.dob = dob
            if gender and not patient.gender:
                patient.gender = gender

        # 3. Check or create EncounterDB
        if encounter_id:
            enc = db.query(EncounterDB).filter(EncounterDB.id == encounter_id).first()
            if not enc:
                enc = EncounterDB(
                    id=encounter_id,
                    patient_id=patient.id,
                    facility_id=source_system,
                    start_time=received_timestamp
                )
                db.add(enc)
                db.flush()

        # 4. Create or ensure SourceDocumentDB record exists before fragments
        doc = db.query(SourceDocumentDB).filter(SourceDocumentDB.id == msg_id).first()
        if not doc:
            doc = SourceDocumentDB(
                id=msg_id,
                source_type="HL7_API_JSON",
                encounter_id=encounter_id,
                patient_id=patient.id,
                document_class="lab_and_medication_feed",
                origin="external_lis" if "LIS" in source_system else "external_system",
                originating_facility_name=source_system,
                capture_timestamp=received_timestamp,
                minio_raw_path=minio_path,
                sha256_checksum=sha256,
                overall_confidence=1.0,
                status="INGESTED",
                raw_text=""
            )
            db.add(doc)
            db.flush()

        # 5. Synthesize raw concatenated text and fragment list from resources
        resources = payload.get("resources", [])
        fragment_texts = []
        fragments = []

        for idx, res in enumerate(resources):
            res_type = res.get("resourceType", "Resource")
            res_id = res.get("id", f"res-{idx}")
            
            # Format readable text representation per resource
            text_repr = f"[{res_type} {res_id}]"
            if res_type == "Observation":
                coding = res.get("code", {}).get("coding", [{}])[0]
                display = coding.get("display", "Observation")
                val_qty = res.get("valueQuantity", {})
                val = f"{val_qty.get('value')} {val_qty.get('unit', '')}".strip() if val_qty else res.get("valueString", "")
                text_repr = f"{display}: {val}"
            elif res_type == "MedicationRequest":
                coding = res.get("medicationCodeableConcept", {}).get("coding", [{}])[0]
                display = coding.get("display", "Medication")
                dosages = res.get("dosageInstruction", [{}])
                instruction = dosages[0].get("text", "") if dosages else ""
                text_repr = f"Rx: {display} - {instruction}".strip()
            elif res_type == "DiagnosticReport":
                coding = res.get("code", {}).get("coding", [{}])[0]
                display = coding.get("display", "Diagnostic Report")
                text_repr = f"Report: {display} (Status: {res.get('status', 'final')})"
            elif res_type == "Condition":
                coding = res.get("code", {}).get("coding", [{}])[0]
                display = coding.get("display", "Condition")
                text_repr = f"Diagnosis: {display}"
            elif res_type == "DocumentReference":
                desc = res.get("description", "Clinical Document")
                text_repr = f"Note: {desc}"

            fragment_texts.append(text_repr)

            frag_id = f"FRAG-{msg_id}-{res_id}"
            frag = db.query(SourceFragmentDB).filter(SourceFragmentDB.id == frag_id).first()
            if not frag:
                frag = SourceFragmentDB(
                    id=frag_id,
                    document_id=msg_id,
                    fragment_index=idx,
                    original_text=text_repr,
                    confidence=1.0,
                    bounding_box=json.dumps({"resourceType": res_type, "resourceId": res_id})
                )
                db.add(frag)
            fragments.append(frag)

        concatenated_raw_text = "\n".join(fragment_texts)
        doc.raw_text = concatenated_raw_text
        db.flush()

        db.commit()
        db.refresh(doc)
        return doc, fragments
