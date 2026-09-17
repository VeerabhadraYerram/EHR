import unittest
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from nlp_models import NLPInput
from extractor import ClinicalEntityExtractor

class TestClinicalNLPCases(unittest.TestCase):
    def setUp(self):
        self.extractor = ClinicalEntityExtractor()

    def test_medication_dosage_frequency(self):
        """Timeline example: Patient is taking Metformin 500 mg twice daily."""
        text = "Patient is taking Metformin 500 mg twice daily."
        inp = NLPInput(document_id="TEST-001", text=text)
        out = self.extractor.extract(inp)
        
        types = [e.entity_type for e in out.entities]
        self.assertIn("MEDICATION", types)
        self.assertIn("DOSAGE", types)
        self.assertIn("FREQUENCY", types)

        med = next(e for e in out.entities if e.entity_type == "MEDICATION")
        self.assertEqual(med.span_text.lower(), "metformin")
        self.assertEqual(med.temporal_status, "ACTIVE")
        self.assertFalse(med.negation_status)

    def test_negation_detection(self):
        """Timeline test: distinctions such as 'no fever', 'no chest pain'."""
        text = "Patient complains of fatigue. No chest pain though."
        inp = NLPInput(document_id="TEST-002", text=text)
        # Add chest pain or test negation pattern
        out = self.extractor.extract(NLPInput(document_id="TEST-002B", text="Patient has no tuberculosis and no signs of acute pancreatitis."))
        pancreatitis = next(e for e in out.entities if "pancreatitis" in e.span_text.lower())
        self.assertTrue(pancreatitis.negation_status)

    def test_temporality_historical(self):
        """Timeline test: 'had TB in 2018' distinction."""
        text = "Patient had TB in 2018, currently asymptomatic."
        inp = NLPInput(document_id="TEST-003", text=text)
        out = self.extractor.extract(inp)
        tb = next(e for e in out.entities if e.span_text.lower() == "tb")
        self.assertEqual(tb.temporal_status, "HISTORICAL")

    def test_hedging_and_rule_out(self):
        """Timeline test: 'likely pneumonia' or 'rule out'."""
        text = "I want to rule out pancreatitis given the abdominal swelling."
        inp = NLPInput(document_id="TEST-004", text=text)
        out = self.extractor.extract(inp)
        panc = next(e for e in out.entities if "pancreatitis" in e.span_text.lower())
        self.assertEqual(panc.certainty, "RULE_OUT")

    def test_prescription_ocr_sample(self):
        """Test on actual OCR prescription sample text."""
        text = "Patient: Rohan Sharma Age: 54 Sex: M. Rx: Metformin 500mg tablet - 1 tab BID with meals. Atorvastatin 10mg tablet - 1 tab OD at night. Dx: Type 2 Diabetes Mellitus, Hyperlipidemia."
        inp = NLPInput(document_id="TEST-005", text=text)
        out = self.extractor.extract(inp)
        
        types = {e.entity_type for e in out.entities}
        self.assertIn("MEDICATION", types)
        self.assertIn("DOSAGE", types)
        self.assertIn("FREQUENCY", types)
        self.assertIn("DIAGNOSIS", types)
        self.assertIn("DEMOGRAPHIC", types)

if __name__ == "__main__":
    unittest.main()
