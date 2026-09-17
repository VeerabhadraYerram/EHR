import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from nlp_models import NLPInput, NLPOutput
from extractor import ClinicalEntityExtractor

app = FastAPI(
    title="Clinical NLP Service",
    description="Week 1 Clinical Named Entity Recognition & Context Baseline",
    version="1.0.0"
)

extractor = ClinicalEntityExtractor()

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "clinical-nlp", "engine": "baseline-extractor"}

@app.post("/api/v1/nlp/extract", response_model=NLPOutput)
def extract_entities(input_data: NLPInput):
    """Extracts clinical entities, spans, confidence scores, and negation/temporality context."""
    try:
        return extractor.extract(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/nlp/test-cases")
def list_test_cases():
    """Returns standard clinical test sentences defined in Timeline Week 1 & 3."""
    return [
        {
            "id": "CASE-1",
            "text": "Patient is taking Metformin 500 mg twice daily.",
            "description": "Medication + dosage + frequency association"
        },
        {
            "id": "CASE-2",
            "text": "Doctor I have been having some fatigue and my feet swell up a little in the evening. No chest pain though.",
            "description": "Negation detection on acute cardiac symptom"
        },
        {
            "id": "CASE-3",
            "text": "Patient had TB in 2018, currently asymptomatic.",
            "description": "Temporality detection (historical vs active)"
        },
        {
            "id": "CASE-4",
            "text": "I want to rule out early kidney involvement given the swelling.",
            "description": "Hedging and rule-out certainty qualifier"
        },
        {
            "id": "CASE-5",
            "text": "Rx: Metformin 500mg tablet - 1 tab BID with meals. Atorvastatin 10mg tablet - 1 tab OD at night. Dx: Type 2 Diabetes Mellitus, Hyperlipidemia.",
            "description": "Full OCR prescription entity extraction"
        }
    ]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
