# Local clinical review adapter

Run from the repository root:

```powershell
python -m uvicorn services.workflows.main:app --host 127.0.0.1 --port 8005
```

Dependencies: FastAPI, Pydantic 2, Uvicorn. Tests additionally use pytest and httpx.
Route `/api/v1/workflows` through the frontend proxy to port 8005 **before** the
generic ingestion `/api` proxy. Storage defaults to `data/workflows/review.sqlite3`;
set `WORKFLOW_DB` to another writable SQLite path to isolate an installation.

`ClinicalWorkflowPage` accepts a twin cohort `patientId` such as `P002`. On first
access it imports source-backed diagnosis/lab/medication facts from cohort CSVs,
all pending clinician review. Imported medication dose metadata is explicitly
marked as derived and must be verified against the original source.

## Executable boundaries

- Accept, edit or reject individual facts; original evidence remains retained.
- Add new source-backed facts with standardized-code fields.
- Identify same-code, same-calendar-day duplicate and conflicting values.
- Explicitly merge identical facts while retaining every source; conflicting
  values require individual review. A merged fact returns to pending review.
- Explicitly accept/dismiss workflow checklist reminders. These are not a
  learned treatment recommender or a claim of similar-case retrieval.
- Preview editable clinician-authored treatment/discharge instructions against
  accepted facts, then finalize only after every flagged fact is resolved.
- Print documents or save PDF through the browser print dialog.
- Approve and persist a FHIR collection bundle with source Provenance locally.
- Record reads, reviews, corrections, exports and approvals in a hash-linked
  audit log. Clinical changes supersede previously finalized documents.
- Inspect legacy ingestion and identity-review data independently, with an
  explicit warning that no cohort-to-legacy patient mapping is established.

## Production integration boundary

This is a local development adapter for the stages in
`project_docs/EHR_Architecture_Document.md`, not a replacement architecture.
SQLite and explicit state transitions make the demo executable; production
still requires the documented PostgreSQL/Camunda workflow, Keycloak/OIDC role
checks, centralized audit service, official HL7 validation against the selected
implementation guide, HAPI FHIR persistence, and Mirth for legacy HL7v2.

Actor strings are **unverified demo labels**. The service binds to loopback and
must not be exposed as an authenticated clinical system. FHIR checks cover basic
resource identity/reference construction only; no official conformance claim is
made. The local store has no hospital transmission endpoint. Hash linking makes
changes inspectable, but a local database administrator can rewrite the log.

The source explorer performs read-only calls to the existing ingestion and
identity services. It does not merge unmatched identities into the cohort.

## Tests

```powershell
python -m pytest tests/test_workflows.py -q --basetemp=.test-workflows-run
```

Use a fresh temporary path when required by Windows workspace restrictions.
