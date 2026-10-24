# Functional QA and hackathon readiness — 24 October 2026

## Result

The core digital-twin proof of concept meets the challenge's technical scope in
the local demonstration: Type 2 diabetes, static clinical context plus recorded
CGM, a two-hour adverse-event predictor and a clinician dashboard. Submission
packaging is incomplete. Passing local tests does not establish clinical safety,
external hospital delivery or production authentication acceptance.

## Verification performed

- Full Python regression after fixes: **91 passed**, 30 warnings. Includes
  ingestion/identity/fusion, temporal feature isolation, model/API/FHIR, review
  persistence/version gates, security, audit, imaging, genomics and validation.
- Frontend data tests: **11 passed**, including new decimal/unit parser cases.
- Production TypeScript/Vite build and oxlint passed. Existing large Three.js
  renderer chunk advisory remains.
- All nine localhost service/frontend readiness checks passed after restart.
- Browser workflows: overview navigation; cohort search/selection and risk
  summaries; keyboard activation of the recording view; scenario unit rejection
  and decimal request; review search; draft creation and persisted audit;
  finalization/approval disabled while facts are pending; replay alert evaluation;
  similar-profile comparison; unconfigured hospital status; access audit; synthetic
  VCF import, chromosome filtering and locus evidence; dossier/FHIR downloads;
  saved model metrics; synthetic CT slices, mask toggle and reconstructed surfaces.
- Legacy source retrieval returned independent source documents and quarantined
  historical records without attaching them to the selected twin profile.
- Downloaded JSON and FHIR bundle both identified P100. JSON recording matched
  2020-11-29T02:02:00. FHIR contained five resources. This is export verification,
  not an external hospital transaction.

API startup briefly produced a 502 during the controlled local restart; Try again
recovered after readiness. The initial sandboxed health/test attempt could not
access localhost. Final integration tests used permitted localhost access.

Browser printing/native file-picker dialogs, external Keycloak login, third-party
embed availability, and a real hospital transaction were not certified by this run.

## Reproducible bugs fixed

1. Care operations had a route but no launch button in the overview navigation.
2. View timeline opened the default model pane instead of CGM playback.
3. Four clickable summary/context panels lacked keyboard activation semantics.
4. The forecast legend called an illustrative sensitivity envelope a 90% confidence
   range, contradicting backend uncertainty metadata.
5. Chat quantities such as 25.5 g could be read as 5 g by integer-only expressions.
6. Unsupported units such as walking distance/hours could silently become minutes;
   walking zero minutes also passed the UI check despite backend rejection.
7. Scenario labels/descriptions truncated or inconsistently rounded decimal inputs.
   Labels now preserve the actual numerical parameters; a backend test covers this.
8. The recording Start label hardcoded midnight despite actual start times such as 00:02.
9. The renderer requested a removed Three.js shadow mode, generating a fallback warning.
10. The legacy-source selector had no accessible label.

The overview and synthetic reconstruction views were checked at 390 px without
horizontal page overflow. Desktop navigation was inspected at 1360 px. Viewport
overrides were reset after testing.

## Official requirements comparison

Source: [official challenge listing](https://api.unstop.com/hackathons/digital-twin-challenge-2026-happiest-health-1757873).

| Requirement | Status and evidence |
| --- | --- |
| One chronic/lifestyle condition relevant to India | Met: Type 2 diabetes. |
| Static EHR and sensor streams | Met: clinical context plus CGM replay; simulation is permitted. |
| Adverse-event prediction | Met as a PoC: two-hour glucose-spike prediction. |
| Doctor-facing dashboard | Met: forecast/SHAP, scenarios, organ context and review pages. |
| Allowed data | Anonymized source-derived cohort and synthetic examples; provenance documented. |
| Public GitHub and team/college folder | Not verified. |
| README team, college, title, use case, stack | Team/college details missing; technical description present. |
| At least 20-minute prototype video | Missing: no qualifying recording or accessible link identified. |
| Project license | Incomplete: asset licenses exist; no root code license identified. |
| Architecture and presentation PDF/PPT | Earlier EHR PDFs exist; current twin deliverables not identified. |

## Scope boundaries, not round-one blockers

Patient-specific acquired CT/MRI anatomy, organ-damage/recovery forecasting, actual
Keycloak login, hospital transactions, provider notifications and independent
Indian/prospective validation are not completed external integrations. The brief
does not demand a complete whole-body twin. Keep the demo centered on the tested
diabetes endpoint and distinguish reference anatomy and assumption-based scenarios.

Recorded benchmark AUC is 0.8852; recall is 57.7% at the saved threshold. Do not
present model performance as perfect detection or prospective clinical validation.

## Test artifacts and local side effects

The QA session created one draft for demonstration profile P001 and imported the
prepared synthetic VCF for P100 (36 loci). It read/evaluated replay records and
downloaded P100 exports. No clinical facts were accepted/edited, record approved,
hospital data sent, or actual genome imported through the browser. Integration
tests also exercise development sample ingestion; their writes are intentional.

No public visibility change, submission, license acceptance, commit or push was
performed by this QA session. Screenshots are saved under docs/evidence/.
