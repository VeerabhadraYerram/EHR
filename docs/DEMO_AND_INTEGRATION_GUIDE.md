# Round-one demonstration and integration guide

The implementation follows `project_docs/EHR_Architecture_Document.md`. The existing launchpad navigation and original atlas are retained. Live wearable integration is paused.

## Demonstration sequence

1. Open http://localhost:5188. Select a profile and a recorded time. Every forecast panel uses that same patient/time response.
2. Open **Anatomical twins → Interactive 3D anatomy**. Toggle skeleton, muscles, cardiovascular, nervous system, body surface and organs. Click a visible organ or its accessible focus button. Orbit, zoom, inspect wireframe, reset and use fullscreen. These are real GLB triangle meshes from BodyParts3D, not flat pictures. Shape is reference anatomy; glucose/lab-conditioned colors are explanatory mappings.
3. Open **Scan reconstruction**. P001 has a generated example. For another profile, click **Generate & reconstruct synthetic CT**. The actual pipeline varies atlas organs with a profile-seeded transformation, voxelizes at 2 mm, generates CT intensities, segments by a declared known-phantom intensity protocol, and applies marching cubes to the computed masks. Twelve documented Taubin smoothing iterations improve display surfaces; volumes remain measured from unsmoothed masks. Inspect slices/overlay and reconstructed meshes; download CT NIfTI, segmentation, ground truth, DICOM series and provenance. The variation is seeded, not inferred from lab values. High Dice is expected for an engineered phantom and is not evidence of clinical segmentation accuracy. MRI, arbitrary uploaded clinical scans and TotalSegmentator inference are not implemented.
4. Open **Forecast**. Move the horizon slider to update the 3D glucose-state illustration. Glucose is the trained forecast endpoint. No separate kidney/heart/brain outcome model is claimed.
5. Open **What-if scenarios → Ask your twin**. Ask “What if I walk for 30 minutes?” or “Reduce carbs by 20 g”. The shared backend supplies all numerical predictions; responses expose the actual SHAP drivers and simulator assumptions. The local request parser and explanation templates are deliberately bounded. This is not an open-ended LLM, causal treatment model or medication dosing assistant. The chart and 3D branch projection follow the selected scenario.
6. Open **Genomics explorer**. Prepare a synthetic VCF, explicitly authorize its local sample linkage, then validate/import. Select chromosome markers, filter by locus/gene or PASS and inspect alleles, genotype, depth and supplied annotation provenance. Real VCF text can be imported within the documented bounds. No genetic-risk prediction, pathogenicity classification, ClinVar lookup or FASTQ/BAM variant calling runs here. Genomics does not silently change the glucose model.
7. Open **Clinical review**. Review/edit/reject facts; resolve identical duplicates/conflicts; prepare a document and approve the current record. Changes carry an expected version, preventing stale review actions. Final documents become DocumentReference resources in a subsequently approved FHIR bundle. Local approval and hospital delivery are separate operations.
8. Open **Care operations**. P005 at `2021-06-21T17:20:00` is a reproducible high-risk replay example. Evaluate its recording, acknowledge, add a resolution note and resolve. Duplicate predictions are deduplicated; a 30-minute cooldown groups repeated active predictions. Escalation is evaluated on refresh after 15 minutes. This is an in-app replay workflow, not an always-running clinical notification service. No SMS/email or external escalation recipient is configured.
9. Compare **Similar profiles** and inspect the exact normalized feature differences. These are synthetic cohort neighbours with no treatment outcomes, not validated historical treatment recommendations. **Access & audit** exposes operating mode and metadata-only access history.

## Startup and reproducibility

```powershell
python -m pip install -r requirements-demo.txt
npm --prefix frontend/doctor-review-ui ci
python scripts/run_app.py
python scripts/run_app.py --check
```

Additional services: imaging 8006, genomics 8007, audit 8008. Workflow operations remain on 8005. The current session switched the twin from its old container to the local runtime on 8004 to load changes without rebuilding the image. PostgreSQL/MinIO remain Docker-managed. Bindings are local; the frontend development proxy is not a production gateway.

Converted anatomy is packaged in `frontend/doctor-review-ui/public/anatomy`, with manifest hashes and attribution. Regeneration:

```powershell
python scripts/fetch_anatomy_sources.py
python scripts/build_anatomy_assets.py
python -m scripts.generate_synthetic_scan P001
```

Source archives and generated studies/databases are ignored by Git. The source fetch uses verified ZIP CRCs; the mesh manifest records SHA-256, units, bounds and conversion. Large meshes use documented bounded vertex clustering. Official source: [BodyParts3D downloads](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), [CC BY 4.0 license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).

## OIDC configuration

The running app remains an explicitly labeled synthetic demo. `EHR_AUTH_MODE=oidc` activates backend signature/issuer/audience/expiry checks, role enforcement and assigned-patient checks. Invalid mode or missing OIDC configuration fails closed. Backend identity overrides submitted reviewer labels. The browser uses the official Keycloak adapter with authorization code + S256 PKCE and memory-held tokens. Do not switch only the frontend flag.

An optional local realm configuration is supplied without users or passwords:

```powershell
# Set KEYCLOAK_ADMIN_PASSWORD yourself in this shell, then:
docker compose -f docker-compose.security.yml up -d
```

In Keycloak, create the authorized user, assign clinician/reviewer/administrator/researcher roles and add the multi-valued `patient_ids` attribute (`P001`, `P002`, etc.). `*` grants cohort-wide access and should be reserved for explicitly authorized accounts. Clinicians review assigned profiles; reviewers additionally finalize/deliver; researchers can read aggregate model metrics, not patient records. Legacy queues lacking individual assignment checks require cohort-wide access. Administrators have broad access by explicit policy in this prototype.

Set on **every backend** and restart:

```powershell
$env:EHR_AUTH_MODE='oidc'
$env:OIDC_ISSUER='http://localhost:8080/realms/ehr'
$env:OIDC_AUDIENCE='ehr-api'
```

Copy the frontend `.env.example` to `.env.local`, set `VITE_AUTH_MODE=oidc` and its URL/realm/client values, then restart Vite. For a deployed realm use HTTPS and production Keycloak/database/TLS configuration. When the twin runs inside Docker and the issuer hostname is not reachable there, set `OIDC_JWKS_URL` to a reachable Keycloak certificates endpoint while keeping `OIDC_ISSUER` equal to the token’s exact issuer. The startup runner rejects a reused backend with a mismatched reported authentication mode.

The optional compose uses development mode bound to loopback, not production configuration. The supplied realm/login flow has not been exercised against an actual running Keycloak instance in this checkpoint; JWT cryptography and middleware policy are tested locally.

Audit records are centrally collected by the local audit module in SQLite, including reads, inference, exports and failed authorization. They exclude clinical text and tokens. The hash chain is tamper-evident, not immutable/WORM retention. PostgreSQL/off-host retention, gateway deployment, service identities and production security acceptance remain separate work. See [Keycloak OIDC](https://www.keycloak.org/securing-apps/oidc-layers), [container configuration](https://www.keycloak.org/server/containers) and [PyJWT verification](https://pyjwt.readthedocs.io/en/stable/usage.html).

## Hospital integration

Set `FHIR_BASE_URL` and, if required, server-side `FHIR_BEARER_TOKEN` on workflow service 8005. No destination is configured in the current demo. Care operations enables delivery only when configured, the bundle is approved and its record version is current. The interoperability client converts to stable-ID PUT transactions, rewrites references, calls `$validate`, rejects error/fatal OperationOutcomes, submits the transaction, verifies every returned status/location and persists receipts or failed attempts. Retries preserve resource IDs. Existing successful deliveries are returned without resending.

The configured server's validation is not the independent official HL7 validator, ABDM profile conformance or certification. Integration tests use a mock FHIR transport; no hospital/HAPI transaction has been sent in this session. Real delivery requires the counterpart's endpoint, credentials and acceptance process. See [FHIR R4 transaction specification](https://hl7.org/fhir/R4/http.html#transaction).

## Independent validation

`scripts/validate_external_cohort.py` evaluates supplied frozen predictions and observed outcomes without training. It rejects malformed labels/probabilities/duplicate decisions and reports AUC, average precision, calibration, Brier score, sensitivity, specificity, precision, alert burden, patient-level bootstrap intervals and supported subgroups.

```powershell
python scripts/validate_external_cohort.py --predictions predictions.csv --manifest cohort.json --threshold 0.1 --output evidence/external-validation.json
```

Use the actual frozen model threshold instead of the example value. CSV requires `patient_id,decision_time,outcome,probability`; optional `sex,age_group,site`. Manifest requires `cohort_kind` (`synthetic-demo`, `external-retrospective`, or `silent-prospective`), `source`, `model_sha256`, `endpoint_definition`, `outcome_ascertainment`, `independence_statement`. The script records the input hash. It cannot establish that supplied outcomes are independent or that participants consented.

No separately obtained Indian cohort or prospective participant outcomes were supplied. Their validation cannot be completed by generating more synthetic records. A frozen, consented silent study and independent outcome ascertainment remain required. Full MedCAT/terminology releases, Camunda orchestration, embedding-based historical outcomes retrieval, acquired-scan segmentation and provider notifications are also not represented as completed integrations.

## Verification evidence (24 October 2026)

- Full regression run: **79 passed**. An additional alert deduplication/cooldown/stale-input test was then added; the **10-test platform/security group passed**. Final smoothed geometry/imaging/security checks: **9 passed**; evaluation checks: **4 passed**.
- Final TypeScript production build and lint passed with no lint warnings. Vite reports the expected large lazy-loaded Three.js chunk (about 643 kB minified); anatomy assets are also substantial. This is not a low-bandwidth deployment performance certification.
- All nine local service/frontend health checks passed. The runner checks authentication mode before reusing a backend.
- Browser verification: real heart/body/muscle geometry; layer and organ controls; CT/mask/mesh inspection; VCF sample import and plotted loci; shared chat walking values; actual replay alert create/acknowledge/resolve; permitted-profile retrieval. P001/P002 completed the actual reconstruction pipeline with distinct measured volumes. No hospital transaction or actual Keycloak login was performed.
- Anatomy and scan tabs were checked at 390 px width: document width remained 390 px, without horizontal overflow. Desktop/mobile screenshots are in `docs/evidence/`.
- Legacy model pickle compatibility and UTC deprecation warnings remain in older test paths. Normal serving uses the previously verified native portable artifacts.

No commits or pushes were made. Original navigation/UI changes and atlas previews remain available.
