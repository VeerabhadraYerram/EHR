import os
import sys
import unittest
import json
import importlib.util
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add root and ingestion to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(BASE_DIR, "services", "ingestion"))

from models import init_db, PatientDB, EncounterDB, SourceDocumentDB, SourceFragmentDB
from storage import storage_client
from adapters.stt_adapter import STTAdapter
from adapters.ocr_adapter import OCRAdapter
from adapters.historical_adapter import HistoricalAdapter
from adapters.hl7_adapter import HL7APIAdapter

# Load NLP extractor dynamically due to hyphen in clinical-processing
nlp_dir = os.path.join(BASE_DIR, "services", "clinical-processing", "nlp")
sys.path.insert(0, nlp_dir)
from nlp_models import NLPInput
from extractor import ClinicalEntityExtractor

class TestWeek1Pipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_url = os.getenv("DATABASE_URL", "postgresql://ehr_user:ehr_password@localhost:5432/ehr_primary")
        cls.engine = create_engine(cls.db_url)
        init_db(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)
        cls.samples_dir = os.path.join(BASE_DIR, "data", "samples")
        cls.extractor = ClinicalEntityExtractor()

    def setUp(self):
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_minio_connectivity_and_integrity(self):
        """Verify MinIO object storage connection and SHA-256 hashing."""
        test_payload = {"test": "pipeline_verification", "timestamp": "2026-08-09T09:00:00Z"}
        uri, sha = storage_client.store_raw_payload("TEST", "test-pipe-01", test_payload)
        self.assertTrue(uri.startswith("ehr-raw-inputs/test/test-pipe-01.json"))
        self.assertEqual(len(sha), 64)

        retrieved = storage_client.get_raw_payload(uri)
        self.assertEqual(retrieved, test_payload)

    def test_02_ingest_speech_to_text(self):
        """Verify Speech-to-Text sample ingestion."""
        sample_path = os.path.join(self.samples_dir, "03_speech_to_text_sample1.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = STTAdapter.process(data, self.db)
        self.assertEqual(doc.source_type, "SPEECH_TO_TEXT")
        self.assertEqual(doc.id, "STT-2026-081234")
        self.assertEqual(doc.status, "INGESTED")
        self.assertEqual(len(frags), 6)
        self.assertIn("Metformin", doc.raw_text)

    def test_03_ingest_ocr_prescription(self):
        """Verify current-encounter OCR prescription ingestion."""
        sample_path = os.path.join(self.samples_dir, "01_ocr_prescription_sample1.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = OCRAdapter.process(data, self.db)
        self.assertEqual(doc.source_type, "OCR")
        self.assertEqual(doc.document_class, "prescription")
        self.assertEqual(doc.id, "OCR-2026-081234")
        self.assertEqual(len(frags), 6)

        # Check bounding box is stored on fragment
        frag1 = frags[0]
        self.assertIsNotNone(frag1.bounding_box)

    def test_04_ingest_historical_document(self):
        """Verify historical document flagged as PENDING_IDENTITY_RESOLUTION."""
        sample_path = os.path.join(self.samples_dir, "02_ocr_historical_document_sample2.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = HistoricalAdapter.process(data, self.db)
        self.assertEqual(doc.source_type, "HISTORICAL_DOCUMENT")
        self.assertEqual(doc.status, "PENDING_IDENTITY_RESOLUTION")
        self.assertIsNone(doc.patient_id, "Historical docs must not be auto-linked before identity match")
        self.assertIsNotNone(doc.identity_hint_fields)
        hints = json.loads(doc.identity_hint_fields)
        self.assertEqual(hints.get("name_raw"), "Rohan Sharma")

    def test_05_ingest_hl7_api_json(self):
        """Verify HL7-format API JSON (labs and prescriptions)."""
        sample_path = os.path.join(self.samples_dir, "05_hl7_api_labs_rx_sample1.json")
        with open(sample_path) as f:
            data = json.load(f)

        doc, frags = HL7APIAdapter.process(data, self.db)
        self.assertEqual(doc.source_type, "HL7_API_JSON")
        self.assertEqual(doc.id, "HL7API-2026-081234")
        self.assertEqual(len(frags), 6)

    def test_06_nlp_extraction_on_ingested_narrative(self):
        """Verify baseline NLP extraction on ingested prescription text."""
        doc = self.db.query(SourceDocumentDB).filter(SourceDocumentDB.id == "OCR-2026-081234").first()
        self.assertIsNotNone(doc)
        
        nlp_out = self.extractor.extract(NLPInput(document_id=doc.id, text=doc.raw_text))
        self.assertGreater(nlp_out.entity_count, 0)
        
        types = {e.entity_type for e in nlp_out.entities}
        self.assertIn("MEDICATION", types)
        self.assertIn("DIAGNOSIS", types)

if __name__ == "__main__":
    unittest.main()
