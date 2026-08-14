# **EHR Clinical Text Understanding, Doctor Verification & HL7 Persistence** 

_Project Scope, Flow, and Acceptance Criteria_ 

August 2026 

#### **Scope boundary** 

This document covers the phase that begins after (1) full medical history capture, (2) doctor–patient conversation summarization, and (3) OCR on prescriptions/documents are already producing raw text. It ends at structured persistence into the EHR in HL7/FHIR form, plus generation of the treatment plan and discharge summary. Ontology mapping, NER, identity resolution, deduplication, doctor verification, and clinical recommendation are all in scope; the upstream speech-to-text and OCR engines themselves are not. 

#### **Update in this revision** 

This version adds historical/external documents as a fourth input source — past records from the same doctor, other doctors, or other hospitals — and adds two new pipeline stages required to use them safely: Identity Resolution & Patient Matching (confirming a historical document belongs to the correct patient) and Deduplication & Longitudinal Merge (collapsing the same fact reported by multiple sources into one record without losing provenance). 

## **1. Background & Context** 

The wider EHR project has four stages: 

- 1. Capture the patient's entire medical history. 

- 2. Capture the doctor–patient conversation and summarize it to simplify documentation. 

- 3. Apply OCR on prescriptions and bring them into the EHR. 

- 4. Optimize case sheet preparation by combining the conversation capture and OCR output into a structured draft for doctor review. 

Stages 1–3 produce raw text from three different sources — speech transcripts, OCR'd prescriptions, and other uploaded or scanned documents. Stage 4 needs that raw text turned into something a doctor can review and correct, and once corrected, persisted into the EHR in a standard clinical format. 

Alongside the current encounter, this phase also needs to bring in historical/external documents belonging to the same patient — past records from the same doctor, from other doctors, or from other hospitals entirely. These arrive with no guarantee they are correctly attached to the right patient, and often overlap with information already captured elsewhere, so they cannot simply be appended to the record the way current-encounter text can. 

#### **This document's scope** 

Everything from "we have raw text from speech/OCR/documents, plus historical/external documents" through to "structured, doctor-verified, HL7/FHIR-compliant data is persisted in the EHR, and a treatment plan and discharge summary are generated." This includes: identity resolution for incoming historical documents, text understanding, entity recognition, ontology/terminology mapping, deduplication and longitudinal merge, context and relation extraction, the doctor verification and correction loop, a clinical recommendation engine informed by past treatment history, and HL7/FHIR structuring for persistence. 

## **2. Objective of This Phase** 

- Parse and understand text from four heterogeneous sources — speech transcript, OCR output, other uploaded/scanned documents from the current encounter, and historical/external documents from the same doctor, other doctors, or other hospitals — as a single, fused clinical narrative. 

- Correctly resolve the identity of the patient a historical/external document belongs to before its content is merged into the record. 

- Identify clinically relevant entities — drugs, labs, demographics, diagnosis codes, vitals, symptoms, procedures — and the relationships/context between them (which drug goes with which dose, which diagnosis is active vs. historical). 

- Detect and merge duplicate information arriving from multiple sources (e.g. the same lab result reported by two hospitals) without discarding provenance. 

- Route uncertain or ambiguous extractions — including identity-match and duplicate-merge decisions — to the doctor for verification and correction, rather than auto-committing them. 

- Structure the doctor-corrected data and persist it into the EHR using HL7/FHIR standards. 

- Use the doctor's own past treatment patterns to generate in-loop clinical recommendations, surfaced for the doctor to accept or override — not to auto-prescribe. 

- Auto-generate a treatment plan and a discharge summary from the same structured, verified data. 



<!-- Start of picture text -->
Clinical Text Understanding & EHR Persistence Pipeline<br>Doctor-Patient<br>Conversation<br>(Speech-to-Text)<br>Prescription /<br>Document OCR<br>other unisedea!) Identity Resolution Text Normalization berteeity Linki Ontology‘Mapping/ Terminology Deduplication & ContextExtraction& Relation<br>Scanned Documents CPOE TE Cain) & Source Fusion! Demographics, Vitals) ay ad Fongitudinal Merge ip erlar th<br>(current encounter)<br>Historical Documents<br>(same doctor, other<br>doctors, other hospitals)<br>aransformationHae Me PlanCase/  SheetDischargeStructuring: / Treatment Summary aeorrection veriicaenificatiLoop (pastClinicaltreatmentRecommendationEngine patterns)<br>a<br>H<br>iiii<br>EHR Ii|<br>Persistence Store 1<br>awo -------- == -- = = - = =.a rena 1!I<br>= Input sources LC) Identity / dedup (new) |] Thisee project's scope CL) Human-in-the-loop CL) Decision support eeae !<br>ea|<br>Past treatment/ outcome history (deduplicated, identity-resolved) feeds recommendation engine<br><!-- End of picture text -->



<!-- Start of picture text -->
Identity Resolution & Deduplication — How It Works<br>Identity Resolution Deduplication<br>Incoming document<br>Speassname,  hospitalDOB, MRN,ID) HbA1cHospital8.2%, A12-Jul-2026 record: HbA1cHospital8.2%,B record:12-Jul-2026<br>Deterministic + probabilistic<br>match against patient index Compare on: normalized code (LOINC),<br>value, date proximity, patient identity<br>High~ auto-linkconfidence Medium~ doctorconfidence confirms bothSingle4, sourcemergedreferences cle le retainedile‘<br>(provenance preserved)<br>Low / no match<br>~ new(flagged)patient record result)Conflicting> flaggedvaluesfor(e.g.doctordifferentreview,<br>not silently auto-resolved<br>Matching factors: name, DOB, gender,<br>phone/national ID, MRN cross-reference,<br>address — never a single field alone Dedup never discards a source record — it links<br>duplicates and keeps the original references<br><!-- End of picture text -->



### **4.3 NER & Entity Linking** 

Named entity recognition tuned for clinical text, covering at minimum: 

|**Entity Type**|**Examples**|**Notes**|
|---|---|---|
|Demographics|age, sex, weight, height|Often needed for dosing checks|
|Diagnosis / Problem|Type 2 Diabetes, hypertension|Must capture active vs. historical status|
|Medication|Metformin, Amoxicillin|Linked to dose, frequency, route|
|Dosage & Frequency|500mg, twice daily, BID|Linked to the medication entity, not<br>standalone|
|Lab / Vital|HbA1c 8.2%, BP 140/90|Value + unit + interpretation|
|Procedure|ECG, biopsy|May reference a diagnosis or lab|
|Allergy / Adverse reaction|Penicillin allergy|High-priority for safety checks|



Every extracted entity carries a confidence score; this score is what drives whether it is auto-accepted or flagged for the doctor verification loop (section 5). 

### **4.4 Ontology & Terminology Mapping** 

Recognized entities are mapped to standard clinical terminologies so the record is computable and interoperable, not just readable: 

|**Domain**|**Standard**|**Used for**|
|---|---|---|
|Diagnoses / problems|ICD-10 / ICD-11|Diagnosis coding for billing, reporting,<br>interoperability|
|Clinical findings & problems|SNOMED CT|Fine-grained clinical concepts,<br>symptoms, procedures|
|Medications|RxNorm|Normalized drug names, strengths, forms|
|Labs & observations|LOINC|Standard lab/observation identifiers|
|Cross-terminology linking|UMLS|Resolving synonyms and mapping<br>between the above|



Where a doctor's free-text term has no exact ontology match, the closest candidate(s) are surfaced with the original text preserved alongside — the doctor confirms or picks an alternative during verification, rather than the system silently choosing. 

### **4.5 Deduplication & Longitudinal Merge** 

With multiple sources now in play — current encounter, same-doctor history, other doctors, other hospitals — the same clinical fact can legitimately appear more than once. Deduplication runs after ontology mapping specifically because normalized codes (not raw text) are what make duplicates reliably detectable. 

- **Comparison basis:** normalized code (e.g. LOINC for a lab, RxNorm for a drug), value, and date proximity — not string similarity on the raw text, which is unreliable across different documentation styles. 

- **Provenance is always retained:** merging two records into one observation keeps a reference to both original sources; nothing is deleted, only linked. This matters for audit and for cases where the doctor wants to see the original document. 



<!-- Start of picture text -->
Example: Entity & Context Extraction from Consult Notes<br><!-- End of picture text -->

Source text (from speech transcript + OCR fusion): 60-year-old with |lype<sup>2Diabetes}</sup> ctarted on 500mg twice daily DEMOGRAPHIC DIAGNOSIS. DRUG DOSE FREQ HbA1c — consistent with prior glycemic control (negation-checked: not 'ruled out') LAB DIAGNOSIS. Structured, linked output (fed to Doctor Verification Loop): demographic: { age: 60, sex: "male" } diagnosis: { text: "Type 2 Diabetes", code: "ICD-11 5A11", status: "active" } medication: { drug: "Metformin", rxnorm: "6809", dose: "500 mg", frequency: "BID", confidence: 0.94} lab: { name: "HbAlc", loinc: "4548-4", value: 8.2, unit: "%", interpretation: "high", confidence: 0.97 } 

### Doctor Verification & Correction Loop 



<!-- Start of picture text -->
Structured entities + Review UI: Doctor reviews:<br>(drug,confidencedose, dx,scoreslabs...) low-confidenceflagged for reviewitems acceptper/ editfield/ reject<br>| No — re-flag remaining items All items<br>resolved?<br>HL7/FHIR structuring Corrected / confirmed Correction logged as<br>& EHR persistence structured record training feedback<br>NER / mapping model<br>improvement cycle<br><!-- End of picture text -->

- The doctor accepts, modifies, or ignores each suggestion; ignored suggestions are logged to avoid repeating unhelpful ones. 

- Once identity-resolved and deduplicated, longitudinal history from other doctors or other hospitals can also inform recommendations — but only as supporting context (e.g. "this patient was previously treated for X at another facility"), kept clearly distinguished from the doctor's own past patterns, since practice standards differ across doctors and institutions. 

#### **Design constraint** 

This is decision support, not autonomous prescribing. Every recommendation must be explainable (why it was suggested, based on which past cases) and must require explicit doctor action to become part of the record. 

## **7. Output Generation: Treatment Plan & Discharge Summary** 

Once the doctor has verified the structured record, the same data drives two auto-generated documents, both presented for doctor review before finalization: 

- **Treatment Plan —** diagnosis summary, prescribed medications with dose/frequency/duration, follow-up investigations, and next review date, assembled from the structured record. 

- **Discharge Summary —** encounter summary, diagnoses, treatment given, medications on discharge, follow-up instructions — assembled the same way, reusing the structured record rather than being authored separately. 

Both documents are templated, not freely generated — the template defines required sections, and the structured record populates them, so the output is consistent and auditable rather than an open-ended generative summary. 

## **8. HL7 / FHIR Structuring & Persistence** 

Once confirmed by the doctor, the structured record is mapped into standard HL7 FHIR resources before persistence, so the data is portable and interoperable beyond this system: 

|**Structured data**|**FHIR resource**|
|---|---|
|Patient demographics|Patient|
|Diagnoses / problems|Condition|
|Medications|MedicationStatement / MedicationRequest|
|Labs & vitals|Observation|
|Lab reports|DiagnosticReport|
|Treatment plan|CarePlan|
|Discharge summary / case sheet|DocumentReference / Composition|
|Encounter details|Encounter|



Where legacy interfaces require HL7 v2 messaging (e.g. ADT, ORU) alongside FHIR, both should be generated from the same canonical structured record rather than maintained as separate transformations. 

For any resource created by merging duplicate records from different sources (section 4.5), the FHIR Provenance resource should record all contributing source documents/systems — the merge must remain traceable after persistence, not just during processing. 

## **9. Non-Functional Requirements** 

- **Traceability —** every structured field must be traceable back to its source fragment (speech/OCR/document) and, once verified, to the doctor action that confirmed it. 

- **Explainability —** confidence scores and recommendation rationale must be visible to the doctor, not just a final answer. 

- **Privacy & security —** all PHI handled per applicable regulations (e.g. HIPAA/local equivalents), with access control and audit logging on every read/write. 

- **Latency —** structured entities should be available for doctor review within the same consultation session, not as an offline batch step. 

- **Auditability —** doctor corrections, accepted/rejected recommendations, and final HL7 payloads must be retained for audit and dispute resolution. 

- **Patient-safety threshold on identity resolution —** the auto-link confidence threshold must be set conservatively; a wrong auto-link (merging another patient's data) is a materially worse outcome than an extra doctor confirmation step, and the two error rates (false-match vs. false-non-match) must be tracked separately. 

## **10. Acceptance Criteria** 

### **10.1 Text Normalization & Fusion** 

- **☐** Speech transcript, OCR output, and uploaded documents for a single encounter are merged into one working narrative with source and confidence retained per fragment. 

- **☐** Original raw text remains accessible and is never overwritten or discarded by normalization. 

### **10.2 Identity Resolution & Patient Matching** 

- **☐** Historical/external documents are matched against the patient index using multiple factors (name, DOB, gender, phone/national ID, MRN, address) — no single field is sufficient for an auto-link. 

- **☐** Match confidence tiers are defined and enforced: high-confidence auto-links, medium-confidence requires doctor confirmation before use, low/no-confidence is flagged rather than discarded or force-linked. 

- **☐** False-match rate (wrong patient linked) and false-non-match rate (existing patient not recognized) are both measured against a test set and reported separately, not as a single blended accuracy figure. 

- **☐** No historical/external document content is merged into the working record before its identity match is at least provisionally resolved. 

### **10.3 NER & Entity Linking** 

- **☐** System correctly identifies and tags, at minimum: demographics, diagnosis/problem, medication, dosage, frequency, lab/vital, procedure, and allergy entities. 

- **☐** Every extracted entity carries a confidence score used to drive the verification loop. 

- **☐** Entity recognition performance (precision/recall) is measured against a clinically reviewed test set before go-live, per entity type. 

### **10.4 Ontology & Terminology Mapping** 

- **☐** Diagnoses map to ICD-10/11 and/or SNOMED CT; medications map to RxNorm; labs map to LOINC. 

- **☐** Where no confident mapping exists, the closest candidate(s) are surfaced for doctor selection rather than silently defaulted. 

- **☐** Original free-text term is preserved alongside the mapped code for every entity. 

### **10.5 Deduplication & Longitudinal Merge** 

- **☐** Duplicate facts across sources (same normalized code, value, and date proximity) are detected and merged into a single observation/record. 

- **☐** Every merged record retains references to all contributing source documents — no source is discarded on merge. 

- **☐** Conflicting values across sources for what appears to be the same fact are flagged for doctor review, not automatically resolved in favor of one source. 

### **10.6 Context & Relation Extraction** 

- **☐** Negated findings are not recorded as positive findings. 

- **☐** Historical vs. active status is correctly distinguished for diagnoses and medications. 

- **☐** Dose/frequency/route are correctly linked to their parent medication, not left as unattached values. 

### **10.7 Doctor Verification & Correction Loop** 

- **☐** Low-confidence or conflicting entities are visibly flagged and cannot be silently auto-committed. 

- **☐** Doctor can accept, edit, or reject any individual entity without re-entering the entire record. 

- **☐** Every doctor action is logged with a timestamp and linked to the specific entity it applies to. 

- **☐** Record cannot proceed to HL7/FHIR structuring until all flagged items are resolved. 

- **☐** Medium-confidence identity matches and conflicting deduplication merges are presented in the same verification loop as entity corrections, with their own accept/reject action. 

### **10.8 Clinical Recommendation Engine** 

- **☐** Recommendations are generated only from the doctor's own historical treatment data (or an explicitly approved reference set), with a stated rationale. 

- **☐** No recommendation is applied to the record without explicit doctor action. 

- **☐** Ignored/rejected recommendations are logged and do not repeat identically for the same doctor/case pattern. 

- **☐** Suggestions sourced from the doctor's own history are visibly distinguished from suggestions sourced from other doctors/hospitals' history. 

### **10.9 Treatment Plan & Discharge Summary** 

- **☐** Both documents are generated from the same verified structured record, using a defined template with required sections. 

- **☐** Doctor can review and edit the generated document before it is finalized. 

### **10.10 HL7/FHIR Structuring & Persistence** 

- **☐** Structured record maps correctly to the required FHIR resources (Patient, Condition, MedicationStatement/Request, Observation, DiagnosticReport, CarePlan, DocumentReference, Encounter). 

- **☐** Generated FHIR resources validate against the applicable FHIR profile/implementation guide before persistence. 

- **☐** Persistence only occurs after doctor verification is complete — no partially-verified record is written to the EHR. 

- **☐** Merged/deduplicated resources carry a Provenance record listing all contributing source documents/systems. 

### **10.11 Non-Functional** 

- **☐** All PHI access is authenticated, authorized, and audit-logged. 

- **☐** Every persisted field is traceable to its source fragment and the doctor action that confirmed it. 

- **☐** End-to-end time from raw input availability to doctor-ready structured record meets the agreed latency target for insession review. 

## **11. Open Risks & Dependencies** 

- NER/ontology mapping accuracy depends heavily on speech-to-text and OCR quality from upstream stages — errors there compound downstream. 

- Ontology coverage gaps (free-text terms with no clean SNOMED/ICD match) will require an ongoing curation process, not a one-time mapping exercise. 

- Recommendation engine needs a minimum volume of a doctor's own historical cases before suggestions are meaningful — cold-start behavior needs to be defined (e.g. fall back to no suggestion rather than a weak one). 

- FHIR profile/implementation guide choice (e.g. base FHIR vs. a national/regional core profile) needs to be confirmed early, as it affects resource structure throughout. 

- Doctor verification UI/UX needs to minimize added workload — if review feels slower than free-text documentation, adoption will suffer regardless of extraction accuracy. 

- False-positive identity matches (merging another patient's history into this record) are a direct patient-safety risk and must be weighted more heavily than doctor-review friction when setting auto-link thresholds. 

- Data quality and identifier availability vary significantly across other hospitals/doctors (some may lack a national ID or consistent MRN format), which will limit achievable identity-match automation for a meaningful share of historical documents — plan for a persistent manual-match queue, not just an edge case. 

- Deduplication logic depends on consistent ontology mapping (section 4.4); mapping errors will propagate into either missed duplicates or incorrect merges, so dedup accuracy is bounded by upstream mapping accuracy. 

