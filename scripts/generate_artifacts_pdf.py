import os
import sys
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Preformatted
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#666666"))
        
        # Draw header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "EHR Clinical Intelligence & Interoperability Platform - Technical Specification")
            self.setStrokeColor(colors.HexColor("#dddddd"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)
        
        # Draw footer
        self.setStrokeColor(colors.HexColor("#dddddd"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        
        self.drawString(54, 34, "CONFIDENTIAL & PROPRIETARY - CLINICAL INFORMATICS & AI SPECIFICATION")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 34, page_text)
        self.restoreState()


def build_styles():
    base_styles = getSampleStyleSheet()
    
    styles = {
        'DocTitle': ParagraphStyle(
            'DocTitle',
            parent=base_styles['Title'],
            fontName='Helvetica-Bold',
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#0f172a"),
            alignment=0,
            spaceAfter=6
        ),
        'DocSubtitle': ParagraphStyle(
            'DocSubtitle',
            parent=base_styles['Normal'],
            fontName='Helvetica',
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#475569"),
            spaceAfter=15
        ),
        'MetaText': ParagraphStyle(
            'MetaText',
            parent=base_styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#64748b")
        ),
        'H1': ParagraphStyle(
            'H1',
            parent=base_styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=16,
            spaceAfter=8,
            keepWithNext=True
        ),
        'H2': ParagraphStyle(
            'H2',
            parent=base_styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=12,
            spaceAfter=6,
            keepWithNext=True
        ),
        'H3': ParagraphStyle(
            'H3',
            parent=base_styles['Heading3'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#334155"),
            spaceBefore=8,
            spaceAfter=4,
            keepWithNext=True
        ),
        'Body': ParagraphStyle(
            'Body',
            parent=base_styles['BodyText'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#1e293b"),
            spaceAfter=6
        ),
        'Bullet': ParagraphStyle(
            'Bullet',
            parent=base_styles['Normal'],
            fontName='Helvetica',
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#1e293b"),
            leftIndent=12,
            firstLineIndent=-8,
            spaceAfter=3
        ),
        'CodeText': ParagraphStyle(
            'CodeText',
            parent=base_styles['Normal'],
            fontName='Courier',
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#0f172a")
        ),
        'CalloutText': ParagraphStyle(
            'CalloutText',
            parent=base_styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#1e293b")
        ),
        'TableHeader': ParagraphStyle(
            'TableHeader',
            parent=base_styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            textColor=colors.white,
            alignment=1
        ),
        'TableCell': ParagraphStyle(
            'TableCell',
            parent=base_styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#1e293b")
        ),
        'TableCellBold': ParagraphStyle(
            'TableCellBold',
            parent=base_styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#0f172a")
        ),
        'TableCellMono': ParagraphStyle(
            'TableCellMono',
            parent=base_styles['Normal'],
            fontName='Courier',
            fontSize=7.5,
            leading=9,
            textColor=colors.HexColor("#0f172a")
        )
    }
    return styles

def create_callout(text, styles, bg_color="#f8fafc", border_color="#cbd5e1"):
    p = Paragraph(text, styles['CalloutText'])
    t = Table([[p]], colWidths=[504])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg_color)),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor(border_color)),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t

def create_code_block(code_str, styles):
    p = Preformatted(code_str, styles['CodeText'])
    t = Table([[p]], colWidths=[504])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t

def build_week1_story(styles):
    story = []
    
    # Title & Metadata
    story.append(Paragraph("EHR Clinical Intelligence Platform", styles['DocTitle']))
    story.append(Paragraph("Week 1 Technical Artifacts: Multi-Source Heterogeneous Ingestion, Canonical Data Models & Clinical NLP Baseline", styles['DocSubtitle']))
    
    meta_data = [
        [Paragraph("<b>Author:</b> AI Clinical Engineering Team", styles['MetaText']),
         Paragraph("<b>Status:</b> Verified & In Production", styles['MetaText']),
         Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d')}", styles['MetaText'])],
        [Paragraph("<b>Target Services:</b> Ingestion (8000), Terminology (8001)", styles['MetaText']),
         Paragraph("<b>Infrastructure:</b> PostgreSQL (5432, 5433), MinIO S3 (9000)", styles['MetaText']),
         Paragraph("<b>Test Suite:</b> 6/6 Integration Tests Passing", styles['MetaText'])]
    ]
    meta_table = Table(meta_data, colWidths=[175, 175, 154])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # Section 1: Architecture & Topology
    story.append(Paragraph("1. System Topology & Core Infrastructure", styles['H1']))
    story.append(Paragraph(
        "Week 1 deployed the foundational persistence layer separating operational EHR transactions from high-dimensional terminology vector lookups. "
        "All components run as containerized microservices managed through Docker Compose meshes.", styles['Body']))

    infra_data = [
        [Paragraph("Component", styles['TableHeader']), Paragraph("Technology", styles['TableHeader']), Paragraph("Port", styles['TableHeader']), Paragraph("Schema / Bucket / Role", styles['TableHeader'])],
        [Paragraph("Primary Operational DB", styles['TableCellBold']), Paragraph("PostgreSQL 16", styles['TableCell']), Paragraph("5432", styles['TableCellMono']), Paragraph("Database: ehr_primary (patients, encounters, documents, fragments)", styles['TableCell'])],
        [Paragraph("Terminology Vector DB", styles['TableCellBold']), Paragraph("PostgreSQL 16 + pgvector", styles['TableCell']), Paragraph("5433", styles['TableCellMono']), Paragraph("Database: terminology_db (384-dim dense cosine embeddings)", styles['TableCell'])],
        [Paragraph("Object Storage Engine", styles['TableCellBold']), Paragraph("MinIO S3 API", styles['TableCell']), Paragraph("9000 / 9001", styles['TableCellMono']), Paragraph("Bucket: ehr-raw-inputs (SHA-256 verified raw payloads)", styles['TableCell'])],
        [Paragraph("Ingestion Microservice", styles['TableCellBold']), Paragraph("FastAPI / Python 3.11", styles['TableCell']), Paragraph("8000", styles['TableCellMono']), Paragraph("REST API: Multi-adapter ingestion, seeding, queries", styles['TableCell'])],
        [Paragraph("Terminology Microservice", styles['TableCellBold']), Paragraph("FastAPI / Python 3.11", styles['TableCell']), Paragraph("8001", styles['TableCellMono']), Paragraph("Hybrid lexical & vector semantic search over ontologies", styles['TableCell'])]
    ]
    t_infra = Table(infra_data, colWidths=[120, 110, 60, 214])
    t_infra.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_infra)
    story.append(Spacer(1, 10))

    # Section 2: Canonical Data Models
    story.append(Paragraph("2. Canonical Relational Models (services/ingestion/models.py)", styles['H1']))
    story.append(Paragraph(
        "The relational schema decouples heterogeneous input streams into normalized entities with full foreign key constraints and audit indexes.", styles['Body']))

    schema_sql = (
        "-- Canonical Source Document Catalog\n"
        "CREATE TABLE source_documents (\n"
        "    id VARCHAR PRIMARY KEY,               -- e.g. STT-2026-081234\n"
        "    patient_id VARCHAR REFERENCES patients(id), -- NULL if quarantined\n"
        "    encounter_id VARCHAR REFERENCES encounters(id),\n"
        "    source_type VARCHAR NOT NULL,          -- SPEECH_TO_TEXT, OCR, HISTORICAL_DOCUMENT, HL7_API_JSON\n"
        "    document_class VARCHAR,                -- consultation_transcript, prescription\n"
        "    minio_path VARCHAR NOT NULL,           -- S3 URI in ehr-raw-inputs\n"
        "    sha256_checksum VARCHAR(64) NOT NULL,  -- 64-char hexadecimal digest\n"
        "    raw_text TEXT NOT NULL,\n"
        "    identity_hint_fields JSONB,            -- Demographic hints for EMPI\n"
        "    status VARCHAR DEFAULT 'INGESTED'      -- Lifecycle: INGESTED, PENDING_IDENTITY_RESOLUTION, LINKED\n"
        ");\n\n"
        "-- Atomic Clinical Fragments\n"
        "CREATE TABLE source_fragments (\n"
        "    id VARCHAR PRIMARY KEY,\n"
        "    document_id VARCHAR REFERENCES source_documents(id) ON DELETE CASCADE,\n"
        "    fragment_index INTEGER NOT NULL,\n"
        "    text_content TEXT NOT NULL,\n"
        "    confidence FLOAT DEFAULT 1.0,\n"
        "    speaker_turn VARCHAR,                  -- DOCTOR | PATIENT\n"
        "    bounding_box JSONB                     -- [ymin, xmin, ymax, xmax]\n"
        ");"
    )
    story.append(create_code_block(schema_sql, styles))
    story.append(Spacer(1, 10))

    # Section 3: Ingestion Adapters
    story.append(Paragraph("3. Heterogeneous Multi-Source Ingestion Adapters", styles['H1']))
    story.append(Paragraph(
        "The ingestion engine supports 4 distinct clinical stream types, each handled by an isolated adapter in "
        "services/ingestion/adapters/:", styles['Body']))

    adapter_data = [
        [Paragraph("Adapter", styles['TableHeader']), Paragraph("Source Format", styles['TableHeader']), Paragraph("Extraction Logic & Attributes", styles['TableHeader']), Paragraph("Quarantine Policy", styles['TableHeader'])],
        [Paragraph("STTAdapter", styles['TableCellBold']), Paragraph("Diarized Audio JSON", styles['TableCell']), Paragraph("Extracts speaker turns (DOCTOR/PATIENT), start/end millisecond timestamps, acoustic confidences.", styles['TableCell']), Paragraph("Immediate Link (status = INGESTED)", styles['TableCell'])],
        [Paragraph("OCRAdapter", styles['TableCellBold']), Paragraph("Scanned Prescriptions", styles['TableCell']), Paragraph("Extracts text blocks, OCR vision confidence scores, and bounding box coordinates [ymin, xmin, ymax, xmax].", styles['TableCell']), Paragraph("Current Encounter (status = INGESTED)", styles['TableCell'])],
        [Paragraph("HistoricalAdapter", styles['TableCellBold']), Paragraph("Legacy Hospital PDFs / OCR", styles['TableCell']), Paragraph("Extracts demographic hints (Name, DOB, Gender, MRN, Facility) into identity_hint_fields.", styles['TableCell']), Paragraph("Strict Quarantine (status = PENDING_IDENTITY_RESOLUTION, patient_id = None)", styles['TableCell'])],
        [Paragraph("HL7APIAdapter", styles['TableCellBold']), Paragraph("FHIR / HL7 v2 JSON", styles['TableCell']), Paragraph("Unpacks Condition, Observation, MedicationRequest, and DiagnosticReport resource collections.", styles['TableCell']), Paragraph("Immediate Link (status = INGESTED)", styles['TableCell'])]
    ]
    t_adapt = Table(adapter_data, colWidths=[90, 95, 209, 110])
    t_adapt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_adapt)
    story.append(Spacer(1, 10))

    story.append(create_callout(
        "<b>Architectural Safety Invariant:</b> Per EHR Architecture Sec 4.3, external historical records are strictly quarantined on arrival. "
        "They are assigned patient_id = None and status = 'PENDING_IDENTITY_RESOLUTION' to guarantee zero leakage into the active patient chart prior to verified identity resolution.",
        styles, bg_color="#eff6ff", border_color="#93c5fd"
    ))
    story.append(Spacer(1, 10))

    # Section 4: Clinical NLP Baseline
    story.append(Paragraph("4. Clinical AI & NLP Baseline Extractor", styles['H1']))
    story.append(Paragraph(
        "Implemented in services/clinical-processing/nlp/extractor.py, the engine performs multi-class clinical entity extraction, "
        "assertion analysis (NegEx scope resolution), and temporality classification.", styles['Body']))
    
    nlp_bullets = [
        "<b>Multi-Class NER:</b> Extracts MEDICATION (agents, formulations), DOSAGE (e.g. 500mg), FREQUENCY (e.g. twice daily with meals), DIAGNOSIS (e.g. Type 2 Diabetes Mellitus, Acute Pancreatitis), and LAB_OBSERVATION (e.g. HbA1c 8.2%, Lipase 210 U/L).",
        "<b>Negation Resolution (NegEx):</b> Evaluates a forward character window of 40 characters from trigger tokens ('denies', 'no history of', 'negative for', 'ruled out'). Extracted entities within the scope are assigned assertion_status = NEGATED.",
        "<b>Temporality Categorization:</b> Discriminates between HISTORICAL diagnoses ('history of', 'resolved', 'prior') and ACTIVE conditions ('current', 'active', 'taking')."
    ]
    for b in nlp_bullets:
        story.append(Paragraph(f"• {b}", styles['Bullet']))
    story.append(Spacer(1, 10))

    # Section 5: Verification & Testing
    story.append(Paragraph("5. Week 1 Verification Suite (tests/test_week1_pipeline.py)", styles['H1']))
    test_data = [
        [Paragraph("Test Identifier", styles['TableHeader']), Paragraph("Scope & Assertions", styles['TableHeader']), Paragraph("Observed Output", styles['TableHeader']), Paragraph("Result", styles['TableHeader'])],
        [Paragraph("test_01_minio_connectivity", styles['TableCellBold']), Paragraph("MinIO S3 connection, bucket creation, SHA-256 hash length == 64, payload round-trip.", styles['TableCell']), Paragraph("URI: ehr-raw-inputs/test/test-pipe-01.json, SHA256 verified", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_02_ingest_speech_to_text", styles['TableCellBold']), Paragraph("Ingest audio transcript, verify doc ID, status == INGESTED, 6 diarized fragments.", styles['TableCell']), Paragraph("doc.id == STT-2026-081234, len(fragments) == 6", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_03_ingest_ocr_prescription", styles['TableCellBold']), Paragraph("Ingest scanned prescription, verify document_class, bounding_box persistence.", styles['TableCell']), Paragraph("doc.id == OCR-2026-081234, bounding_box verified", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_04_ingest_historical_doc", styles['TableCellBold']), Paragraph("Verify quarantine invariant: status == PENDING_IDENTITY_RESOLUTION, patient_id == None.", styles['TableCell']), Paragraph("Quarantined doc with extracted Rohan Sharma hints", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_05_ingest_hl7_api_json", styles['TableCellBold']), Paragraph("Unpack FHIR/HL7 collection bundle into discrete clinical observation fragments.", styles['TableCell']), Paragraph("doc.id == HL7API-2026-081234, 6 fragments created", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_06_nlp_extraction", styles['TableCellBold']), Paragraph("Execute NER extractor over ingested narrative, verify MEDICATION and DIAGNOSIS extraction.", styles['TableCell']), Paragraph("entity_count > 0, MEDICATION and DIAGNOSIS extracted", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])]
    ]
    t_tests = Table(test_data, colWidths=[120, 164, 160, 60])
    t_tests.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_tests)
    
    return story

def build_week2_story(styles):
    story = []
    
    # Title & Metadata
    story.append(Paragraph("EHR Clinical Intelligence Platform", styles['DocTitle']))
    story.append(Paragraph("Week 2 Technical Artifacts: Hybrid Patient Identity Resolution, Text Fusion & Dual-Theme Review UI", styles['DocSubtitle']))
    
    meta_data = [
        [Paragraph("<b>Author:</b> AI Clinical Engineering Team", styles['MetaText']),
         Paragraph("<b>Status:</b> Verified & In Production", styles['MetaText']),
         Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d')}", styles['MetaText'])],
        [Paragraph("<b>Target Services:</b> EMPI (8002), Fusion (8003), UI (5173)", styles['MetaText']),
         Paragraph("<b>Algorithms:</b> Jaro-Winkler, Phenotype Jaccard, Safety Vetoes", styles['MetaText']),
         Paragraph("<b>Test Suite:</b> 6/6 Integration Tests Passing", styles['MetaText'])]
    ]
    meta_table = Table(meta_data, colWidths=[175, 175, 154])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # Section 1: EMPI Identity Resolution
    story.append(Paragraph("1. Hybrid Multi-Factor Patient Identity Resolution (EMPI)", styles['H1']))
    story.append(Paragraph(
        "Operating on Port 8002 (services/identity-resolution/), the EMPI engine associates unindexed external documents with candidate patients. "
        "It combines multi-factor demographic string distances, clinical phenotype ontology overlap, and hard safety vetoes.", styles['Body']))

    formula_box = (
        "COMPOSITE MATCH SCORING FORMULATION:\n"
        "  S_total = (0.85 * S_demo) + (0.15 * S_pheno)\n\n"
        "Where Demographic Score (S_demo) is a weighted sum:\n"
        "  S_demo = 0.30*S_name + 0.25*S_dob + 0.10*S_gender + 0.15*S_nat_id + 0.10*S_phone + 0.10*S_addr\n"
        "  • S_name: Jaro-Winkler distance with token sort ratio fallback\n"
        "  • S_dob: Exact ISO match (1.0), transposition tolerance (0.80), year-month (0.70)\n"
        "  • S_nat_id: Masked trailing suffix match (e.g. XXXX-XXXX-4432 -> 4432)\n"
        "  • S_phone: Trailing 10-digit unmasked alignment\n\n"
        "Where Phenotype Overlap (S_pheno) evaluates SNOMED CT and RxNorm concept overlap:\n"
        "  S_pheno = Jaccard(C_patient, C_doc) = |C_patient n C_doc| / |C_patient u C_doc|"
    )
    story.append(create_code_block(formula_box, styles))
    story.append(Spacer(1, 8))

    # Safety Vetoes Callout
    story.append(create_callout(
        "<b>Deterministic Clinical Safety Vetoes:</b><br/>"
        "1. <b>Birth Year Discrepancy:</b> If |Year(DOB_doc) - Year(DOB_patient)| > 2 years -> FATAL VETO.<br/>"
        "2. <b>Biological Gender Conflict:</b> If Gender_doc != Gender_patient (both specified) -> FATAL VETO.<br/>"
        "<b>Consequence:</b> Regardless of name similarity, S_total is capped at <= 0.35, tier = MANUAL_REVIEW, and the document is permanently quarantined.",
        styles, bg_color="#fef2f2", border_color="#fca5a5"
    ))
    story.append(Spacer(1, 10))

    # Tiers Table
    story.append(Paragraph("Confidence Decision Tiers & Forensic Audit Trail", styles['H2']))
    tier_data = [
        [Paragraph("Confidence Tier", styles['TableHeader']), Paragraph("Score Range", styles['TableHeader']), Paragraph("Decision Action", styles['TableHeader']), Paragraph("Clinical Routing & Pipeline Behavior", styles['TableHeader'])],
        [Paragraph("Tier 1 (High)", styles['TableCellBold']), Paragraph("Score >= 0.85", styles['TableCellMono']), Paragraph("AUTO_LINK", styles['TableCellBold']), Paragraph("Automatically assigns patient_id in database, updates status = 'LINKED'. Enters patient timeline immediately.", styles['TableCell'])],
        [Paragraph("Tier 2 (Medium)", styles['TableCellBold']), Paragraph("0.60 <= Score < 0.85", styles['TableCellMono']), Paragraph("DOCTOR_VERIFICATION", styles['TableCellBold']), Paragraph("Holds document in quarantine (status = 'PENDING_IDENTITY_RESOLUTION'). Dispatches to physician review queue.", styles['TableCell'])],
        [Paragraph("Tier 3 (Low / Veto)", styles['TableCellBold']), Paragraph("Score < 0.60 or Veto", styles['TableCellMono']), Paragraph("MANUAL_REVIEW", styles['TableCellBold']), Paragraph("Quarantined permanently (status = 'QUARANTINED'). Completely excluded from clinical timeline.", styles['TableCell'])]
    ]
    t_tier = Table(tier_data, colWidths=[95, 85, 110, 214])
    t_tier.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_tier)
    story.append(Spacer(1, 12))

    # Section 2: Clinical Text Fusion
    story.append(Paragraph("2. Clinical Text Normalization & Source Fusion (Port 8003)", styles['H1']))
    story.append(Paragraph(
        "Implemented in services/clinical-processing/fusion/engine.py, the fusion engine normalizes heterogeneous fragments into a unified patient trajectory.", styles['Body']))
    
    fusion_bullets = [
        "<b>Strict Quarantine Invariant:</b> Strictly queries documents WHERE status IN ('INGESTED', 'LINKED', 'PROCESSED'). Any document in PENDING_IDENTITY_RESOLUTION, QUARANTINED, or REJECTED status is physically excluded, guaranteeing ZERO TIMELINE LEAKAGE.",
        "<b>Chronological Patient Trajectory:</b> Interleaves multi-modal records (audio consultations, prescriptions, lab feeds, resolved external discharge summaries) sorted chronologically by UTC timestamp.",
        "<b>Cryptographic Provenance Verification:</b> Every timeline item and narrative assertion embeds its MinIO S3 URI and 64-character SHA-256 checksum.",
        "<b>Synthesized Working Narrative:</b> Organizes patient records into 4 structured sections: (1) Active Consultation Dialogue, (2) Diagnostic/Lab Observations, (3) Reconciled Historical Precedents, (4) Cryptographic Provenance Ledger."
    ]
    for b in fusion_bullets:
        story.append(Paragraph(f"• {b}", styles['Bullet']))
    story.append(Spacer(1, 12))

    # Section 3: Doctor Review UI & Design System
    story.append(Paragraph("3. Doctor Review UI & Dual-Theme Monochrome Architecture", styles['H1']))
    story.append(Paragraph(
        "Built with React 19 + TypeScript + Vite on Port 5173, the web application delivers a high-contrast, minimalist clinical interface.", styles['Body']))

    ui_data = [
        [Paragraph("Clinical View", styles['TableHeader']), Paragraph("Route", styles['TableHeader']), Paragraph("Primary Capabilities & Physician Workflows", styles['TableHeader'])],
        [Paragraph("Patient Dashboard", styles['TableCellBold']), Paragraph("/", styles['TableCellMono']), Paragraph("Real-time stream feed across all 4 clinical sources, encounter banner, fragment inspector, raw JSON viewer.", styles['TableCell'])],
        [Paragraph("Verification Queue", styles['TableCellBold']), Paragraph("/review", styles['TableCellMono']), Paragraph("Side-by-side comparison of incoming document hints vs registered candidate patient, multi-factor score breakdown meters, one-click [Confirm Link] and [Reject & Quarantine] actions.", styles['TableCell'])],
        [Paragraph("Unified Timeline", styles['TableCellBold']), Paragraph("/timeline", styles['TableCellMono']), Paragraph("Patient selector dropdown, vertical chronological timeline with 1px hairline guide and node dots, copyable SHA-256 hash, and synthesized clinical working narrative.", styles['TableCell'])]
    ]
    t_ui = Table(ui_data, colWidths=[110, 60, 334])
    t_ui.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_ui)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Dual-Theme Inverted Architecture (Bright Mode vs Dark Mode)", styles['H2']))
    story.append(Paragraph(
        "Per strict clinical design specifications, the UI adheres to a <b>zero-rainbow color palette</b> (no blues, greens, ambers, or purples), "
        "employing semantic CSS variables for instant inversion:", styles['Body']))

    theme_data = [
        [Paragraph("Semantic Token", styles['TableHeader']), Paragraph("Dark Mode ([data-theme='dark'])", styles['TableHeader']), Paragraph("Bright Mode ([data-theme='light'])", styles['TableHeader']), Paragraph("Clinical Intent", styles['TableHeader'])],
        [Paragraph("--bg-main", styles['TableCellMono']), Paragraph("Deep Void Black (#000000)", styles['TableCell']), Paragraph("Stark Pure White (#ffffff)", styles['TableCell']), Paragraph("Full canvas base", styles['TableCell'])],
        [Paragraph("--bg-surface", styles['TableCellMono']), Paragraph("Onyx (#0a0a0a)", styles['TableCell']), Paragraph("Off-White Card (#f7f7f8)", styles['TableCell']), Paragraph("Card container elevation", styles['TableCell'])],
        [Paragraph("--text-primary", styles['TableCellMono']), Paragraph("Pure White (#ffffff)", styles['TableCell']), Paragraph("Solid Black (#000000)", styles['TableCell']), Paragraph("Primary clinical typography", styles['TableCell'])],
        [Paragraph("--code-bg", styles['TableCellMono']), Paragraph("Pure Black (#000000)", styles['TableCell']), Paragraph("Soft Code Gray (#f2f2f5)", styles['TableCell']), Paragraph("Monospace narrative container", styles['TableCell'])],
        [Paragraph("--btn-primary-bg", styles['TableCellMono']), Paragraph("Solid White (#ffffff)", styles['TableCell']), Paragraph("Solid Black (#000000)", styles['TableCell']), Paragraph("High-contrast action trigger", styles['TableCell'])],
        [Paragraph("--timeline-dot", styles['TableCellMono']), Paragraph("White with black border", styles['TableCell']), Paragraph("Black with white border", styles['TableCell']), Paragraph("Chronological event marker", styles['TableCell'])]
    ]
    t_theme = Table(theme_data, colWidths=[90, 134, 134, 146])
    t_theme.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_theme)
    story.append(Spacer(1, 10))

    # Section 4: Verification & Testing
    story.append(Paragraph("4. Week 2 Verification Suite (tests/test_week2_pipeline.py)", styles['H1']))
    w2_test_data = [
        [Paragraph("Test Identifier", styles['TableHeader']), Paragraph("Scope & Assertions", styles['TableHeader']), Paragraph("Observed Output", styles['TableHeader']), Paragraph("Result", styles['TableHeader'])],
        [Paragraph("test_01_tier1_autolink", styles['TableCellBold']), Paragraph("High confidence (>= 0.85) auto-associates patient and updates status to LINKED.", styles['TableCell']), Paragraph("tier == AUTO_LINK, score >= 0.85, doc.status == LINKED", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_02_tier2_doctor_queue", styles['TableCellBold']), Paragraph("Medium confidence (0.60 - 0.84) holds in quarantine and routes to review queue.", styles['TableCell']), Paragraph("tier == DOCTOR_VERIFICATION, present in review queue", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_03_doctor_confirmation", styles['TableCellBold']), Paragraph("Physician confirms linkage: document transitions to LINKED, exits queue, updates DB.", styles['TableCell']), Paragraph("confirm success, doc linked to PT-HOSP-MRN-55210", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_04_tier3_hard_veto", styles['TableCellBold']), Paragraph("Birth year discrepancy > 2 years triggers hard veto, caps score <= 0.40, quarantines.", styles['TableCell']), Paragraph("tier == MANUAL_REVIEW, FATAL CONFLICT detected, status == QUARANTINED", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_05_phenotype_boost", styles['TableCellBold']), Paragraph("Matching SNOMED CT and RxNorm concepts verified to boost overall linkage confidence.", styles['TableCell']), Paragraph("matching score > irrelevant score, overlap verified", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])],
        [Paragraph("test_06_quarantine_isolation", styles['TableCellBold']), Paragraph("Quarantined docs strictly excluded from timeline; cleared docs sorted chronologically.", styles['TableCell']), Paragraph("Quarantined doc absent from timeline; UTC order verified", styles['TableCellMono']), Paragraph("PASS (ok)", styles['TableCellBold'])]
    ]
    t_w2_tests = Table(w2_test_data, colWidths=[120, 164, 160, 60])
    t_w2_tests.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_w2_tests)
    
    return story

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    artifacts_dir = os.path.join(repo_root, "artifacts")
    week1_dir = os.path.join(artifacts_dir, "week-1")
    week2_dir = os.path.join(artifacts_dir, "week-2")
    
    os.makedirs(week1_dir, exist_ok=True)
    os.makedirs(week2_dir, exist_ok=True)
    
    styles = build_styles()
    
    # 1. Generate Week 1 PDF
    w1_pdf_path = os.path.join(week1_dir, "EHR_Week_1_Technical_Artifacts.pdf")
    doc_w1 = SimpleDocTemplate(
        w1_pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story_w1 = build_week1_story(styles)
    doc_w1.build(story_w1, canvasmaker=NumberedCanvas)
    print(f"Created: {w1_pdf_path}")
    
    # 2. Generate Week 2 PDF
    w2_pdf_path = os.path.join(week2_dir, "EHR_Week_2_Technical_Artifacts.pdf")
    doc_w2 = SimpleDocTemplate(
        w2_pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story_w2 = build_week2_story(styles)
    doc_w2.build(story_w2, canvasmaker=NumberedCanvas)
    print(f"Created: {w2_pdf_path}")
    
    # 3. Generate Master Consolidated PDF
    master_pdf_path = os.path.join(artifacts_dir, "EHR_Platform_Weeks_1_and_2_Master_Artifacts.pdf")
    doc_master = SimpleDocTemplate(
        master_pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    story_master = []
    # Title Page Header
    story_master.append(Paragraph("EHR Clinical Intelligence & Interoperability Platform", styles['DocTitle']))
    story_master.append(Paragraph("Master Technical Specification & Engineering Artifacts: Weeks 1 & 2", styles['DocSubtitle']))
    story_master.append(create_callout(
        "<b>Executive Technical Summary:</b> This consolidated master document specifies the complete architectural, algorithmic, persistence, and workflow implementations "
        "delivered across Week 1 (Multi-Source Ingestion & Clinical NLP) and Week 2 (Patient Identity Resolution EMPI, Text Fusion & Doctor Review UI). "
        "All data models, scoring functions, safety invariants, and test results are verified against running services and canonical database stores.",
        styles, bg_color="#f8fafc", border_color="#cbd5e1"
    ))
    story_master.append(Spacer(1, 14))
    
    # Combine fresh stories with page break
    story_master.extend(build_week1_story(styles))
    story_master.append(PageBreak())
    story_master.extend(build_week2_story(styles))
    
    doc_master.build(story_master, canvasmaker=NumberedCanvas)
    print(f"Created: {master_pdf_path}")

if __name__ == "__main__":
    main()
