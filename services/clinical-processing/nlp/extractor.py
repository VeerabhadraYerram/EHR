import re
try:
    from nlp_models import ClinicalEntitySpan, NLPInput, NLPOutput
except ImportError:
    try:
        from services.clinical_processing.nlp.nlp_models import ClinicalEntitySpan, NLPInput, NLPOutput
    except ImportError:
        from nlp.nlp_models import ClinicalEntitySpan, NLPInput, NLPOutput


class ClinicalEntityExtractor:
    """
    Week 1 Baseline Clinical Entity Extractor.
    Extracts the core 8 entity types, flags negation/hedging/temporality,
    and returns confidence-scored entity spans.
    """

    MEDICATIONS = [
        "metformin", "atorvastatin", "pantoprazole", "amoxicillin", "lisinopril", 
        "aspirin", "insulin", "paracetamol", "omeprazole", "glimepiride"
    ]

    DIAGNOSES = [
        "type 2 diabetes mellitus", "type 2 diabetes", "diabetes", "hyperlipidemia", 
        "acute pancreatitis", "pancreatitis", "hypertension", "pneumonia", "tb", "tuberculosis"
    ]

    PROCEDURES = [
        "ecg", "biopsy", "kidney function test", "kft", "lipid profile", "chest x-ray"
    ]

    ALLERGIES = [
        "penicillin", "sulfa", "aspirin allergy", "peanut"
    ]

    NEGATION_TRIGGERS = ["no", "denies", "without", "negative for", "ruled out", "no signs of"]
    HEDGING_TRIGGERS = ["likely", "rule out", "suspected", "possible", "eval for"]
    HISTORICAL_TRIGGERS = ["had", "history of", "in 2018", "past", "previously"]

    def extract(self, input_data: NLPInput) -> NLPOutput:
        text = input_data.text
        text_lower = text.lower()
        entities: List[ClinicalEntitySpan] = []
        entity_counter = 1

        def check_context(start_char: int, window: int = 40):
            prefix = text_lower[max(0, start_char - window):start_char]
            negated = any(re.search(rf"\b{re.escape(t)}\b", prefix) for t in self.NEGATION_TRIGGERS)
            hedged = any(re.search(rf"\b{re.escape(t)}\b", prefix) for t in self.HEDGING_TRIGGERS)
            historical = any(re.search(rf"\b{re.escape(t)}\b", prefix) for t in self.HISTORICAL_TRIGGERS)
            
            certainty = "RULE_OUT" if "rule out" in prefix else ("SUSPECTED" if hedged else "CONFIRMED")
            temporality = "HISTORICAL" if historical else "ACTIVE"
            return negated, certainty, temporality

        # 1. Medications
        for med in self.MEDICATIONS:
            for match in re.finditer(rf"\b{re.escape(med)}\b", text_lower):
                neg, cert, temp = check_context(match.start())
                entities.append(ClinicalEntitySpan(
                    entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                    entity_type="MEDICATION",
                    span_text=text[match.start():match.end()],
                    start_char=match.start(),
                    end_char=match.end(),
                    confidence=0.95,
                    negation_status=neg,
                    certainty=cert,
                    temporal_status=temp
                ))
                entity_counter += 1

        # 2. Dosages & Units (e.g., 500mg, 10 mg, 40mg)
        for match in re.finditer(r"\b\d+(\.\d+)?\s*(mg|g|mcg|ml|tablet|tab|units|u)\b", text_lower):
            entities.append(ClinicalEntitySpan(
                entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                entity_type="DOSAGE",
                span_text=text[match.start():match.end()],
                start_char=match.start(),
                end_char=match.end(),
                confidence=0.92
            ))
            entity_counter += 1

        # 3. Frequency / Route (e.g., BID, OD, twice daily, at night, with meals)
        for match in re.finditer(r"\b(bid|od|tid|qid|prn|twice daily|once daily|twice a day|at night|with meals|daily)\b", text_lower):
            entities.append(ClinicalEntitySpan(
                entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                entity_type="FREQUENCY",
                span_text=text[match.start():match.end()],
                start_char=match.start(),
                end_char=match.end(),
                confidence=0.90
            ))
            entity_counter += 1

        # 4. Diagnoses
        for dx in self.DIAGNOSES:
            for match in re.finditer(rf"\b{re.escape(dx)}\b", text_lower):
                neg, cert, temp = check_context(match.start())
                entities.append(ClinicalEntitySpan(
                    entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                    entity_type="DIAGNOSIS",
                    span_text=text[match.start():match.end()],
                    start_char=match.start(),
                    end_char=match.end(),
                    confidence=0.91,
                    negation_status=neg,
                    certainty=cert,
                    temporal_status=temp
                ))
                entity_counter += 1

        # 5. Labs & Vitals (e.g. HbA1c 8.2%, Lipase 210 U/L, BP 140/90)
        for match in re.finditer(r"\b(hba1c|lipase|bp|blood pressure|creatinine|cholesterol)\s*(was|is|:|at)?\s*([0-9]+(\.[0-9]+)?(\s*[%|u\/l|mg\/dl]|\/[0-9]+)?)\b", text_lower):
            entities.append(ClinicalEntitySpan(
                entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                entity_type="LAB_VITAL",
                span_text=text[match.start():match.end()],
                start_char=match.start(),
                end_char=match.end(),
                confidence=0.88
            ))
            entity_counter += 1

        # 6. Demographics (e.g. Age: 54, Sex: M, 54-year-old male)
        for match in re.finditer(r"\b(age:\s*\d+|sex:\s*[mf]|male|female|\d+\s*(years old|yo))\b", text_lower):
            entities.append(ClinicalEntitySpan(
                entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                entity_type="DEMOGRAPHIC",
                span_text=text[match.start():match.end()],
                start_char=match.start(),
                end_char=match.end(),
                confidence=0.94
            ))
            entity_counter += 1

        # 7. Procedures
        for proc in self.PROCEDURES:
            for match in re.finditer(rf"\b{re.escape(proc)}\b", text_lower):
                entities.append(ClinicalEntitySpan(
                    entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                    entity_type="PROCEDURE",
                    span_text=text[match.start():match.end()],
                    start_char=match.start(),
                    end_char=match.end(),
                    confidence=0.85
                ))
                entity_counter += 1

        # 8. Allergies
        for allergy in self.ALLERGIES:
            for match in re.finditer(rf"\b{re.escape(allergy)}(\s*allergy)?\b", text_lower):
                entities.append(ClinicalEntitySpan(
                    entity_id=f"ENT-{input_data.document_id}-{entity_counter}",
                    entity_type="ALLERGY",
                    span_text=text[match.start():match.end()],
                    start_char=match.start(),
                    end_char=match.end(),
                    confidence=0.89
                ))
                entity_counter += 1

        # Sort entities by start_char
        entities.sort(key=lambda e: e.start_char)

        return NLPOutput(
            document_id=input_data.document_id,
            text_processed_length=len(text),
            entity_count=len(entities),
            entities=entities
        )
