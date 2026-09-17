import re
import sys
import os
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from rapidfuzz.distance import JaroWinkler
from rapidfuzz import fuzz

# Ensure parent and module paths are in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import importlib.util

def _load_extractor():
    nlp_dir = os.path.join(ROOT_DIR, "services", "clinical-processing", "nlp")
    models_path = os.path.join(nlp_dir, "nlp_models.py")
    spec_m = importlib.util.spec_from_file_location("nlp_models", models_path)
    mod_m = importlib.util.module_from_spec(spec_m)
    sys.modules["nlp_models"] = mod_m
    spec_m.loader.exec_module(mod_m)

    extractor_path = os.path.join(nlp_dir, "extractor.py")
    spec_e = importlib.util.spec_from_file_location("clinical_extractor", extractor_path)
    mod_e = importlib.util.module_from_spec(spec_e)
    sys.modules["clinical_extractor"] = mod_e
    spec_e.loader.exec_module(mod_e)
    return mod_e.ClinicalEntityExtractor, mod_m.NLPInput

ClinicalEntityExtractor, NLPInput = _load_extractor()

from identity_models import MatchScoreBreakdown, MatchDecision

class PatientIdentityMatcher:
    """
    Production-Grade Hybrid Identity Resolution Engine.
    Combines deterministic factors, probabilistic demographic string distance (Jaro-Winkler),
    and clinical phenotype ontology overlap (SNOMED & RxNorm) with clinical safety vetoes.
    """

    def __init__(self):
        self.nlp_extractor = ClinicalEntityExtractor()

    @staticmethod
    def normalize_digits(s: Optional[str]) -> str:
        if not s:
            return ""
        return re.sub(r"\D", "", s)

    @staticmethod
    def normalize_string(s: Optional[str]) -> str:
        if not s:
            return ""
        return re.sub(r"\s+", " ", s.strip().lower())

    @staticmethod
    def parse_dob(dob_str: Optional[str]) -> Optional[datetime]:
        if not dob_str:
            return None
        formats = [
            "%Y-%m-%d", "%d-%b-%Y", "%d/%m/%Y", "%m/%d/%Y",
            "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"
        ]
        s = dob_str.strip()
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        return None

    @staticmethod
    def standardize_gender(g: Optional[str]) -> Optional[str]:
        if not g:
            return None
        g_clean = g.strip().upper()
        if g_clean in ["M", "MALE"]:
            return "M"
        if g_clean in ["F", "FEMALE"]:
            return "F"
        if g_clean in ["O", "OTHER"]:
            return "O"
        return g_clean[:1]

    def compute_name_score(self, name1: str, name2: str) -> float:
        n1 = self.normalize_string(name1)
        n2 = self.normalize_string(name2)
        if not n1 or not n2:
            return 0.0
        if n1 == n2:
            return 1.0

        # Jaro-Winkler is the gold-standard in EMPI for names
        jw_sim = JaroWinkler.similarity(n1, n2)
        token_sort = fuzz.token_sort_ratio(n1, n2) / 100.0
        return max(jw_sim, token_sort)

    def compute_dob_score(self, dob_str1: Optional[str], dob_str2: Optional[str]) -> Tuple[float, bool]:
        """
        Returns (score, has_hard_conflict).
        A birth year discrepancy > 2 years is a hard biological conflict.
        """
        d1 = self.parse_dob(dob_str1)
        d2 = self.parse_dob(dob_str2)

        if not d1 or not d2:
            return (0.4, False) # Missing data, neutral/uncertain

        if d1.date() == d2.date():
            return (1.0, False)

        year_diff = abs(d1.year - d2.year)
        if year_diff > 2:
            # Fatal biological age conflict -> Veto
            return (0.0, True)

        if d1.month == d2.month and d1.day == d2.day and year_diff <= 1:
            return (0.8, False) # Common OCR / recording off-by-one typo

        return (0.2, False)

    def compute_gender_score(self, g1: Optional[str], g2: Optional[str]) -> Tuple[float, bool]:
        sg1 = self.standardize_gender(g1)
        sg2 = self.standardize_gender(g2)

        if not sg1 or not sg2:
            return (0.5, False)
        if sg1 == sg2:
            return (1.0, False)
        # Direct conflict on gender
        return (0.0, True)

    def compute_phone_score(self, p1: Optional[str], p2: Optional[str]) -> Optional[float]:
        if not p1 or not p2:
            return None
        # Handle masked phone numbers (e.g. +91-98xxxxxx10)
        m1 = re.search(r"[xX*]", p1)
        m2 = re.search(r"[xX*]", p2)
        if m1 or m2:
            s1 = re.search(r"(\d+)$", p1.strip())
            s2 = re.search(r"(\d+)$", p2.strip())
            if s1 and s2:
                s_short = s1.group(1) if len(s1.group(1)) <= len(s2.group(1)) else s2.group(1)
                s_long = s2.group(1) if len(s1.group(1)) <= len(s2.group(1)) else s1.group(1)
                if s_long.endswith(s_short):
                    return 1.0
            return 0.5

        d1 = self.normalize_digits(p1)
        d2 = self.normalize_digits(p2)
        if not d1 or not d2 or len(d1) < 4 or len(d2) < 4:
            return None
        if len(d1) >= 7 and len(d2) >= 7 and d1[-7:] == d2[-7:]:
            return 1.0
        return 0.0

    def compute_national_id_score(self, id1: Optional[str], id2: Optional[str]) -> Optional[float]:
        if not id1 or not id2:
            return None
        c1 = re.sub(r"[^A-Za-z0-9]", "", id1).upper()
        c2 = re.sub(r"[^A-Za-z0-9]", "", id2).upper()
        if not c1 or not c2 or len(c1) < 4 or len(c2) < 4:
            return None
        # Check full match or unmasked 4-digit suffix match (e.g. XXXX-XXXX-4432)
        if c1 == c2:
            return 1.0
        if c1[-4:] == c2[-4:]:
            return 1.0
        return 0.0

    def compute_address_score(self, a1: Optional[str], a2: Optional[str]) -> Optional[float]:
        if not a1 or not a2:
            return None
        return fuzz.token_set_ratio(a1, a2) / 100.0

    def extract_phenotypes_from_text(self, text: str) -> Dict[str, List[str]]:
        """Extracts normalized conditions and medications using Clinical NLP."""
        if not text:
            return {"conditions": [], "medications": []}
        nlp_out = self.nlp_extractor.extract(NLPInput(document_id="TMP", text=text))
        conditions = [e.span_text.lower() for e in nlp_out.entities if e.entity_type == "DIAGNOSIS" and not e.negation_status]
        medications = [e.span_text.lower() for e in nlp_out.entities if e.entity_type == "MEDICATION" and not e.negation_status]
        return {
            "conditions": list(set(conditions)),
            "medications": list(set(medications))
        }

    def compute_phenotype_overlap(self, doc_phenotypes: Dict[str, List[str]], patient_phenotypes: Dict[str, List[str]]) -> float:
        doc_all = set(doc_phenotypes.get("conditions", []) + doc_phenotypes.get("medications", []))
        pat_all = set(patient_phenotypes.get("conditions", []) + patient_phenotypes.get("medications", []))

        if not doc_all or not pat_all:
            return 0.5 # Neutral if patient history not yet documented

        intersection = doc_all.intersection(pat_all)
        if not intersection:
            return 0.2

        # Jaccard overlap relative to doc concepts
        return round(len(intersection) / len(doc_all), 4)

    def evaluate_match(
        self,
        document_id: str,
        hints: Dict[str, Any],
        doc_raw_text: str,
        candidate_patient: Any,
        candidate_historical_text: Optional[str] = None
    ) -> MatchDecision:
        reasons: List[str] = []
        conflicts: List[str] = []
        hard_conflict = False

        # 1. Demographic factors
        name_score = self.compute_name_score(hints.get("name_raw", ""), candidate_patient.name)
        if name_score >= 0.85:
            reasons.append(f"Strong name similarity ({name_score:.2f})")
        elif name_score < 0.5:
            conflicts.append(f"Low name similarity ({name_score:.2f})")

        dob_score, dob_conflict = self.compute_dob_score(hints.get("dob_raw"), candidate_patient.dob)
        if dob_conflict:
            conflicts.append("FATAL CONFLICT: Birth year difference exceeds clinical safety tolerance (> 2 years)")
            hard_conflict = True
        elif dob_score >= 0.8:
            reasons.append("Matching date of birth")

        gender_score, gender_conflict = self.compute_gender_score(hints.get("gender_raw"), candidate_patient.gender)
        if gender_conflict:
            conflicts.append("Biological gender mismatch")
            hard_conflict = True
        elif gender_score == 1.0:
            reasons.append("Matching biological gender")

        # Optional identifiers
        phone_score = self.compute_phone_score(hints.get("phone_raw"), getattr(candidate_patient, "phone", None))
        if phone_score is not None and phone_score >= 0.8:
            reasons.append("Matching phone number / digits")

        nat_id_score = self.compute_national_id_score(hints.get("national_id_raw"), getattr(candidate_patient, "national_id", None))
        if nat_id_score is not None and nat_id_score >= 0.8:
            reasons.append("Exact national ID match")

        addr_score = self.compute_address_score(hints.get("address_raw"), getattr(candidate_patient, "address", None))
        if addr_score is not None and addr_score >= 0.7:
            reasons.append(f"Address alignment ({addr_score:.2f})")

        mrn_score: Optional[float] = None
        mrn_raw = hints.get("mrn_raw")
        if mrn_raw and candidate_patient.mrn:
            if mrn_raw.strip().upper() == candidate_patient.mrn.strip().upper():
                mrn_score = 1.0
                reasons.append("Exact MRN match")

        # Dynamic normalized demographic weighting across available fields
        field_scores: List[Tuple[float, float]] = [] # (score, weight)

        field_scores.append((name_score, 0.25))
        field_scores.append((dob_score, 0.25))
        field_scores.append((gender_score, 0.05))

        has_anchor = False
        if nat_id_score is not None:
            field_scores.append((nat_id_score, 0.25))
            if nat_id_score >= 0.8:
                has_anchor = True

        if phone_score is not None:
            field_scores.append((phone_score, 0.15))
            if phone_score >= 0.8:
                has_anchor = True

        if mrn_score is not None:
            field_scores.append((mrn_score, 0.20))
            if mrn_score == 1.0:
                has_anchor = True

        if addr_score is not None:
            field_scores.append((addr_score, 0.10))

        # Clinical Safety Rule: If NO primary anchor identifier (National ID, Phone, MRN) is present,
        # require an anchor weight penalty to prevent automated linking without definitive proof.
        total_weight = sum(w for _, w in field_scores)
        if not has_anchor:
            total_weight += 0.20 # Anchor absence barrier

        demographic_score = sum(s * w for s, w in field_scores) / total_weight if total_weight > 0 else 0.0

        # 2. Clinical Phenotype Overlap (Ontology Concepts)
        doc_phenotypes = self.extract_phenotypes_from_text(doc_raw_text)
        pat_phenotypes = self.extract_phenotypes_from_text(candidate_historical_text or "")
        phenotype_score = self.compute_phenotype_overlap(doc_phenotypes, pat_phenotypes)

        shared_concepts = set(doc_phenotypes.get("conditions", []) + doc_phenotypes.get("medications", [])).intersection(
            set(pat_phenotypes.get("conditions", []) + pat_phenotypes.get("medications", []))
        )
        if shared_concepts:
            reasons.append(f"Shared clinical phenotype concepts: {', '.join(shared_concepts)}")

        # 3. Final Score & Tiering
        if hard_conflict:
            combined_score = min(demographic_score, 0.35)
            tier = "MANUAL_REVIEW"
            status = "QUARANTINED"
        else:
            # 80% demographic + 20% clinical phenotype
            combined_score = round(0.80 * demographic_score + 0.20 * phenotype_score, 4)

            if combined_score >= 0.85:
                tier = "AUTO_LINK"
                status = "LINKED"
            elif combined_score >= 0.60:
                tier = "DOCTOR_VERIFICATION"
                status = "PENDING_IDENTITY_RESOLUTION"
            else:
                tier = "MANUAL_REVIEW"
                status = "QUARANTINED"

        breakdown = MatchScoreBreakdown(
            name_score=round(name_score, 3),
            dob_score=round(dob_score, 3),
            gender_score=round(gender_score, 3),
            phone_score=round(phone_score, 3) if phone_score is not None else 0.0,
            national_id_score=round(nat_id_score, 3) if nat_id_score is not None else 0.0,
            address_score=round(addr_score, 3) if addr_score is not None else 0.0,
            mrn_score=round(mrn_score, 3) if mrn_score is not None else 0.0,
            demographic_composite=round(demographic_score, 3),
            phenotype_overlap=round(phenotype_score, 3),
            combined_score=combined_score
        )

        return MatchDecision(
            document_id=document_id,
            patient_id=candidate_patient.id,
            patient_name=candidate_patient.name,
            patient_mrn=candidate_patient.mrn,
            tier=tier,
            combined_score=combined_score,
            breakdown=breakdown,
            reasons=reasons,
            conflicts=conflicts,
            status=status
        )
