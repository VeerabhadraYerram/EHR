import os
import sys
import json
import unittest
import urllib.request
import urllib.parse
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(BASE_DIR, "services", "ingestion"))
sys.path.insert(0, os.path.join(BASE_DIR, "services", "identity-resolution"))
sys.path.insert(0, os.path.join(BASE_DIR, "services", "clinical-processing", "fusion"))

from models import init_db, PatientDB, SourceDocumentDB, SourceFragmentDB
from adapters.historical_adapter import HistoricalAdapter
from adapters.stt_adapter import STTAdapter
from adapters.hl7_adapter import HL7APIAdapter
from identity_models import init_identity_db, IdentityMatchAuditDB
from matcher import PatientIdentityMatcher
from engine import ClinicalFusionEngine

class TestWeek2Pipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_url = os.getenv("DATABASE_URL", "postgresql://ehr_user:ehr_password@localhost:5432/ehr_primary")
        cls.engine = create_engine(cls.db_url)
        init_db(cls.engine)
        init_identity_db()
        cls.SessionLocal = sessionmaker(bind=cls.engine)
        cls.samples_dir = os.path.join(BASE_DIR, "data", "samples")
        cls.matcher = PatientIdentityMatcher()
        cls.fusion_engine = ClinicalFusionEngine()

        # Ensure registered patient PT-HOSP-MRN-55210 is fully provisioned in DB
        db = cls.SessionLocal()
        patient = db.query(PatientDB).filter_by(id="PT-HOSP-MRN-55210").first()
        if not patient:
            patient = PatientDB(
                id="PT-HOSP-MRN-55210",
                mrn="HOSP-MRN-55210",
                name="Rohan Sharma",
                dob="1972-03-14",
                gender="M",
                phone="+91-9811223310",
                national_id="XXXX-XXXX-4432",
                address="12 MG Road, Pune, Maharashtra"
            )
            db.add(patient)
        else:
            patient.name = "Rohan Sharma"
            patient.dob = "1972-03-14"
            patient.gender = "M"
            patient.phone = "+91-9811223310"
            patient.national_id = "XXXX-XXXX-4432"
            patient.address = "12 MG Road, Pune, Maharashtra"
        db.commit()
        db.close()

    def setUp(self):
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()

    def _http_post(self, url: str, payload: dict) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _http_get(self, url: str) -> dict:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def test_01_tier1_autolink_workflow(self):
        """
        Verify Tier 1 Auto-Linking Workflow:
        Sample with matching demographics & clinical phenotype automatically links to registered patient.
        """
        sample_path = os.path.join(self.samples_dir, "02_historical_sample_tier1_autolink.json")
        with open(sample_path) as f:
            data = json.load(f)

        # 1. Ingest via HistoricalAdapter (held provisionally as PENDING_IDENTITY_RESOLUTION)
        doc, frags = HistoricalAdapter.process(data, self.db)
        self.db.commit()
        self.assertEqual(doc.id, "HIST-DOC-TIER1-001")
        self.assertEqual(doc.status, "PENDING_IDENTITY_RESOLUTION")
        self.assertIsNone(doc.patient_id)

        # 2. Evaluate via Identity Resolution Service
        eval_resp = self._http_post("http://localhost:8002/api/v1/identity/evaluate", {
            "document_id": doc.id,
            "target_patient_id": "PT-HOSP-MRN-55210",
            "auto_apply": True
        })

        self.assertEqual(eval_resp["tier"], "AUTO_LINK")
        self.assertGreaterEqual(eval_resp["combined_score"], 0.85)
        self.assertEqual(len(eval_resp["conflicts"]), 0)

        # 3. Check DB state: Document is now LINKED with patient_id assigned
        self.db.refresh(doc)
        self.assertEqual(doc.status, "LINKED")
        self.assertEqual(doc.patient_id, "PT-HOSP-MRN-55210")

    def test_02_tier2_doctor_verification_queue(self):
        """
        Verify Tier 2 Workflow:
        Sample with slight name typo & missing phone is routed to Doctor Verification Queue.
        """
        sample_path = os.path.join(self.samples_dir, "02_historical_sample_tier2_doctor_verify.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = HistoricalAdapter.process(data, self.db)
        self.db.commit()
        self.assertEqual(doc.id, "HIST-DOC-TIER2-002")

        eval_resp = self._http_post("http://localhost:8002/api/v1/identity/evaluate", {
            "document_id": doc.id,
            "target_patient_id": "PT-HOSP-MRN-55210",
            "auto_apply": True
        })

        self.assertEqual(eval_resp["tier"], "DOCTOR_VERIFICATION")
        self.assertGreaterEqual(eval_resp["combined_score"], 0.60)
        self.assertLess(eval_resp["combined_score"], 0.85)

        # Verify document remains quarantined/pending in DB
        self.db.refresh(doc)
        self.assertEqual(doc.status, "PENDING_IDENTITY_RESOLUTION")

        # Verify presence in doctor review queue
        queue_resp = self._http_get("http://localhost:8002/api/v1/identity/review-queue")
        queue_doc_ids = [item["document_id"] for item in queue_resp["items"]]
        self.assertIn("HIST-DOC-TIER2-002", queue_doc_ids)

    def test_03_doctor_confirmation_workflow(self):
        """
        Verify Physician Confirmation:
        Doctor reviews pending match, confirms linkage, and document transitions to LINKED.
        """
        confirm_resp = self._http_post("http://localhost:8002/api/v1/identity/confirm", {
            "document_id": "HIST-DOC-TIER2-002",
            "patient_id": "PT-HOSP-MRN-55210",
            "doctor_id": "DR-ROHIT-MEHTA",
            "action": "CONFIRM",
            "notes": "Verified past records from Pune Metro clinic match active diabetic regimen."
        })

        self.assertEqual(confirm_resp["status"], "success")
        self.assertEqual(confirm_resp["document_status"], "LINKED")
        self.assertEqual(confirm_resp["patient_id"], "PT-HOSP-MRN-55210")

        # Verify document is updated in DB
        doc = self.db.query(SourceDocumentDB).filter_by(id="HIST-DOC-TIER2-002").first()
        self.assertIsNotNone(doc)
        self.assertEqual(doc.status, "LINKED")
        self.assertEqual(doc.patient_id, "PT-HOSP-MRN-55210")

        # Verify item is removed from pending review queue
        queue_resp = self._http_get("http://localhost:8002/api/v1/identity/review-queue")
        queue_doc_ids = [item["document_id"] for item in queue_resp["items"]]
        self.assertNotIn("HIST-DOC-TIER2-002", queue_doc_ids)

    def test_04_tier3_hard_conflict_veto_and_quarantine(self):
        """
        Verify Tier 3 Hard Conflict Veto:
        Sample with birth year difference > 2 years is vetoed and permanently quarantined.
        """
        sample_path = os.path.join(self.samples_dir, "02_historical_sample_tier3_manual_review.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = HistoricalAdapter.process(data, self.db)
        self.db.commit()
        self.assertEqual(doc.id, "HIST-DOC-TIER3-003")

        eval_resp = self._http_post("http://localhost:8002/api/v1/identity/evaluate", {
            "document_id": doc.id,
            "target_patient_id": "PT-HOSP-MRN-55210",
            "auto_apply": True
        })

        self.assertEqual(eval_resp["tier"], "MANUAL_REVIEW")
        self.assertLessEqual(eval_resp["combined_score"], 0.40)
        self.assertTrue(any("FATAL CONFLICT" in c for c in eval_resp["conflicts"]))

        # Check DB state: Document is quarantined and UNLINKED
        self.db.refresh(doc)
        self.assertEqual(doc.status, "QUARANTINED")
        self.assertIsNone(doc.patient_id)

    def test_05_clinical_phenotype_ontology_boost(self):
        """
        Verify Clinical Phenotype Boost:
        Matching SNOMED / RxNorm concepts increases overall identity match confidence.
        """
        patient = self.db.query(PatientDB).filter_by(id="PT-HOSP-MRN-55210").first()
        hints = {
            "name_raw": "Rohan Sharma",
            "dob_raw": "1972-03-14",
            "gender_raw": "M",
            "phone_raw": None,
            "national_id_raw": None,
            "address_raw": None
        }

        # Scenario A: Zero clinical overlap
        doc_text_irrelevant = "Patient seen for routine dental cleaning. No systemic illness."
        patient_hist = "Acute pancreatitis, type 2 diabetes mellitus, taking metformin."
        decision_irrelevant = self.matcher.evaluate_match(
            document_id="TEST-PHENOTYPE-A",
            hints=hints,
            doc_raw_text=doc_text_irrelevant,
            candidate_patient=patient,
            candidate_historical_text=patient_hist
        )

        # Scenario B: High clinical overlap (Pancreatitis, Diabetes, Metformin)
        doc_text_matching = "Discharge summary for acute pancreatitis and type 2 diabetes. Prescribed metformin 500mg."
        decision_matching = self.matcher.evaluate_match(
            document_id="TEST-PHENOTYPE-B",
            hints=hints,
            doc_raw_text=doc_text_matching,
            candidate_patient=patient,
            candidate_historical_text=patient_hist
        )

        self.assertGreater(
            decision_matching.combined_score,
            decision_irrelevant.combined_score,
            "Matching clinical phenotype ontology concepts must boost combined score."
        )
        self.assertGreater(
            decision_matching.breakdown.phenotype_overlap,
            decision_irrelevant.breakdown.phenotype_overlap
        )

    def test_06_quarantine_isolation_in_text_fusion(self):
        """
        Verify Quarantine Safety Invariant in Text Fusion:
        Unlinked and quarantined documents NEVER appear in the active chronological timeline or narrative.
        """
        # Ensure at least one current consultation (STT) is present for patient
        stt_sample = os.path.join(self.samples_dir, "03_speech_to_text_sample1.json")
        with open(stt_sample) as f:
            stt_data = json.load(f)
        stt_doc, _ = STTAdapter.process(stt_data, self.db)
        stt_doc.patient_id = "PT-HOSP-MRN-55210"
        stt_doc.status = "INGESTED"
        self.db.commit()

        # Query Timeline from Fusion Service
        timeline_resp = self._http_get("http://localhost:8003/api/v1/fusion/patient/PT-HOSP-MRN-55210/timeline")
        doc_ids_in_timeline = [item["document_id"] for item in timeline_resp["timeline"]]

        # Quarantined document (HIST-DOC-TIER3-003) must NEVER be in timeline
        self.assertNotIn("HIST-DOC-TIER3-003", doc_ids_in_timeline)

        # Linked documents (STT and resolved Tier 1/2) must be present
        self.assertIn("HIST-DOC-TIER1-001", doc_ids_in_timeline)
        self.assertIn("HIST-DOC-TIER2-002", doc_ids_in_timeline)

        # Check chronological ordering
        timestamps = [item["timestamp"] for item in timeline_resp["timeline"]]
        self.assertEqual(timestamps, sorted(timestamps), "Timeline items must be sorted strictly chronologically.")

        # Query Fused Narrative
        narr_resp = self._http_get("http://localhost:8003/api/v1/fusion/patient/PT-HOSP-MRN-55210/narrative")
        self.assertIn("Unified Clinical Narrative", narr_resp["working_narrative"])
        self.assertGreaterEqual(len(narr_resp["sections"]), 2)

        # Ensure SHA256 cryptographic provenance is present in all cited sources
        for src in narr_resp["sources_included"]:
            self.assertEqual(len(src["sha256"]), 64)
            self.assertTrue(src["minio_path"].startswith("ehr-raw-inputs/"))

if __name__ == "__main__":
    unittest.main()
