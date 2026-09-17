# EHR Clinical Text Understanding, Doctor Verification & HL7/FHIR Persistence
## Timeline and Milestones

---

### MILESTONES

#### Week 1 — Foundation and Input Ingestion
**Main Goal:**
Build the basic system infrastructure and allow all required data sources to enter the system.

**AI / NLP:**
* Set up MedCAT/scispaCy environment.
* Define the NLP input and output structure.
* Prepare initial clinical test cases.
* Begin basic entity extraction.

**Backend / EHR:**
* Set up FastAPI.
* Set up PostgreSQL.
* Set up MinIO.
* Create Docker Compose environment.
* Define Patient, Encounter, Document, Source Fragment and related data models.
* Build ingestion APIs.
* Support sample STT JSON, OCR JSON, historical documents and HL7-format JSON.

**Frontend / Workflow:**
* Set up React.
* Build the basic application layout.
* Create patient dashboard.
* Connect frontend with backend APIs.
* Display uploaded/input data.

**Week 1 Milestone:**
All required input sources can enter the backend and basic information can be displayed through the frontend.

---

#### Week 2 — Patient Identity Resolution and Text Fusion
**Main Goal:**
Correctly associate historical documents with patients and combine information from different sources into a unified timeline.

**AI / NLP:**
* Assist with defining patient-matching features.
* Prepare identity-matching test cases.
* Continue development of basic NER.

**Backend / EHR:**
* Implement patient identity resolution.
* Match using multiple factors such as:
  * Name
  * Date of birth
  * Gender
  * Phone / national ID
  * MRN
  * Address
* Implement confidence tiers:
  * High confidence → automatic linking
  * Medium confidence → doctor verification
  * Low/no confidence → manual review
* Build the text fusion service.
* Create a chronological patient timeline.
* Preserve source and confidence information.
* *Note:* Historical documents must not be merged into the patient's working record until their identity has been provisionally resolved.

**Frontend / Workflow:**
* Build patient profile view.
* Build historical record view.
* Display unified clinical timeline.
* Display document source and patient-match confidence.

**Week 2 Milestone:**
Multiple documents and data sources can be associated with the correct patient and displayed as one unified clinical timeline.

---

#### Week 3 — Clinical NLP and Context Understanding
**Main Goal:**
Convert raw clinical text into structured clinical information.

**AI / NLP:**
Implement extraction of:
* Demographics
* Diagnoses / problems
* Medications
* Dosages
* Frequency
* Labs
* Vitals
* Procedures
* Allergies

Add:
* Entity confidence scores
* Negation detection
* Temporality detection
* Certainty / hedging detection
* Basic entity relationships

*Example:*
"Patient is taking Metformin 500 mg twice daily."
Should become:
* Medication → Metformin
* Dosage → 500 mg
* Frequency → twice daily

The system must also understand distinctions such as "no fever", "had TB in 2018", and "likely pneumonia".

**Backend / EHR:**
* Integrate the NLP service with the backend.
* Store extracted entities.
* Store confidence and context information.
* Build APIs for retrieving structured entities.

**Frontend / Workflow:**
* Display extracted clinical entities.
* Display confidence scores.
* Show the original source text associated with each entity.
* Display entity relationships.

**Week 3 Milestone:**
Raw clinical text can be converted into structured clinical entities with confidence, context and relationships.

---

#### Week 4 — Medical Terminology Mapping and Deduplication
**Main Goal:**
Convert clinical concepts into standardized medical codes and identify duplicate or conflicting information.

**AI / NLP:**
Implement terminology mapping:
* Diagnoses → ICD-10/11 and/or SNOMED CT
* Medications → RxNorm
* Labs → LOINC
* Cross-terminology linking → UMLS

Then implement:
* Duplicate detection
* Duplicate merging
* Conflict detection
* Provenance preservation

*Note:* The original free-text term must remain available alongside its mapped code.

**Backend / EHR:**
* Store standardized codes.
* Implement provenance storage.
* Implement merge and conflict APIs.
* Ensure original source documents remain accessible.

**Frontend / Workflow:**
* Display standardized codes.
* Display duplicate records and their sources.
* Build conflict-resolution interface.
* Show the original source information for merged records.

**Week 4 Milestone:**
The system produces a normalized clinical record in which duplicates are merged, conflicts are identified, and every merged fact retains its original sources.

---

#### Week 5 — Doctor Verification and Correction
**Main Goal:**
Give the doctor complete control over the final clinical record.
The doctor verification stage is the central human-in-the-loop checkpoint of the system.

**AI / NLP:**
* Improve confidence thresholds.
* Identify low-confidence entities.
* Prepare uncertain mappings for doctor review.
* Prepare conflicting information for review.

**Backend / EHR:**
* Implement review-task APIs.
* Store doctor decisions.
* Implement audit logging.
* Prevent finalization when unresolved issues remain.

**Frontend / Workflow:**
Build the main doctor verification dashboard.

*Example:*
- **Diagnosis:** ✓ Type 2 Diabetes — 98%
- **Medication:** ✓ Metformin 500 mg BID — 96%
- **Allergy:** ! Penicillin — 61%  `[Accept] [Edit] [Reject]`
- **Patient Match:** ! 73% confidence  `[Confirm] [Reject]`
- **Lab Conflict:** ! HbA1c: 8.2 vs 7.4  `[Select] [Edit]`

The doctor must be able to individually:
* Accept
* Edit
* Reject
each flagged item.

Every doctor action must be recorded with a timestamp and linked to the relevant entity.

**Week 5 Milestone:**
A doctor can review, correct and approve the complete AI-generated clinical record without manually rewriting the entire case.

---

#### Week 6 — Clinical Recommendations and Document Generation
**Main Goal:**
Use the verified information to assist the doctor and automatically generate clinical documents.

**AI / NLP:**
Build the clinical recommendation engine.
* **Input:**
  * Current patient's structured information
  * Diagnosis
  * Demographics
  * Laboratory results
  * Doctor's historical cases
* **Output:**
  * Similar historical cases
  * Previously used treatments
  * Explainable suggestions

*Example:*
"Metformin was used in 24 of 32 similar cases."

*Note:* Recommendations must remain suggestions and require explicit doctor action. They must never be automatically applied to the record.

**Backend / EHR:**
* Build recommendation APIs.
* Implement historical-case retrieval.
* Create treatment-plan data structures.
* Create discharge-summary data structures.

**Frontend / Workflow:**
Build:
* Recommendation interface
* Treatment Plan preview
* Discharge Summary preview
* Doctor editing interface

Both documents must be generated from the same verified structured record using predefined templates.

**Week 6 Milestone:**
After verification, the system can provide explainable recommendations and generate a treatment plan and discharge summary.

---

#### Week 7 — HL7/FHIR and EHR Persistence
**Main Goal:**
Convert the verified clinical record into standardized FHIR resources and persist it in the EHR.

**AI / NLP:**
* Verify that clinical entities and medical codes are correctly represented in FHIR.
* Validate mappings for diagnoses, medications and observations.

**Backend / EHR:**
Implement FHIR resource generation for:
* Patient
* Condition
* MedicationRequest / MedicationStatement
* Observation
* DiagnosticReport
* CarePlan
* DocumentReference
* Encounter

Then implement:
```
Verified Clinical Record
        ↓
  FHIR Resources
        ↓
 FHIR Validation
        ↓
    HAPI FHIR
        ↓
       EHR
```

If required, implement legacy HL7 v2 messaging through Mirth Connect.
The project requires persistence only after doctor verification and requires merged resources to retain their Provenance information.

**Frontend / Workflow:**
* Build finalization screen.
* Display verification status.
* Display FHIR generation status.
* Display EHR persistence status.
* Display audit/history information.

**Week 7 Milestone:**
A doctor-approved record can be converted into valid FHIR resources and persisted in the EHR.

---

#### Week 8 — Full Integration, Testing and Final Demo
**Main Goal:**
Complete the entire pipeline, identify failures, fix them, and prepare the final demonstration.
*No major new features should be added during Week 8.*

**AI / NLP Testing:**
* **Test:**
  * Negated findings
  * Historical conditions
  * Uncertain diagnoses
  * Medication + dosage + frequency
  * Multiple medications
  * Conflicting information
  * Entity extraction accuracy
  * Ontology mapping
  * Deduplication
* **Measure:**
  * Precision
  * Recall
  * Entity-level accuracy
  * Mapping accuracy
  * Deduplication accuracy
* *Requirement:* NER performance must be measured against a clinically reviewed test set.

**Backend / EHR Testing:**
* **Test:**
  * Wrong patient documents
  * Same-name patients
  * Missing identifiers
  * Ambiguous patient matches
  * Duplicate records
  * Conflicting laboratory values
  * FHIR validation
  * API failures
  * Data traceability
  * Audit logging
  * End-to-end latency
* *Requirement:* Measure false-match and false-non-match rates separately for patient matching.

**Frontend / Workflow Testing:**
* **Test:**
  * Accept
  * Edit
  * Reject
  * Conflict resolution
  * Identity confirmation
  * Recommendation acceptance/rejection
  * Document editing
  * Finalization
  * EHR persistence status
  * Error handling

**Final End-to-End Test:**
The complete demonstration should follow:
```
STT / OCR / Documents / HL7
            ↓
     Patient Matching
            ↓
        Text Fusion
            ↓
       Clinical NLP
            ↓
   Ontology Mapping
            ↓
      Deduplication
            ↓
  Context & Relations
            ↓
   Doctor Verification
            ↓
     Recommendations
            ↓
  Treatment / Discharge
            ↓
        FHIR / HL7
            ↓
           EHR
```

**Week 8 Milestone:**
The complete system works from raw clinical inputs to a doctor-verified, traceable and validated EHR record, with treatment and discharge documents generated from the verified data.

---

### Final 8-Week Milestones Summary

| Week | Milestone |
| :--- | :--- |
| **Week 1** | All inputs enter the system |
| **Week 2** | Patient matching + unified timeline |
| **Week 3** | Clinical text → structured entities |
| **Week 4** | Standardized + deduplicated clinical record |
| **Week 5** | Doctor verification complete |
| **Week 6** | Recommendations + clinical documents |
| **Week 7** | FHIR/HL7 → EHR persistence |
| **Week 8** | Full testing + final demonstration |

---

### Final Target
By the end of 8 weeks, the project should demonstrate one complete workflow:
> **Multiple messy medical sources → patient identification → information fusion → clinical NLP → medical coding → deduplication → doctor verification → recommendations → treatment/discharge documents → HL7/FHIR → EHR.**

The implementation should prioritize this complete end-to-end workflow over attempting to productionize every infrastructure component in the architecture document. The architecture identifies Docker Compose as suitable for development, while Kubernetes is recommended for production; therefore, production-scale infrastructure should only be added after the core pipeline is functional.
