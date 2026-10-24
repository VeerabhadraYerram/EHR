# Sequential implementation checkpoints

Existing uncommitted UI changes are preserved. Each checkpoint is verified before the next implementation stage.

1. **Complete — 3 geometry tests, production build and browser heart inspection passed:** licensed real 3D layered atlas, clickable isolated organs, patient-conditioned visual state and forecast playback. Atlas geometry must never be claimed as a scan reconstruction.

2. **Complete — 5 imaging/geometry tests, production build and browser checks:** Actual synthetic CT segmentation, marching cubes, NIfTI/DICOM and measured organ volumes.

3. **Complete — 8 VCF tests, build and browser import checks:** Patient-linked VCF import with explicit build/sample/consent, chromosome/locus visualization, genotype/annotation evidence and persistent provenance. FASTQ calling and clinical interpretation remain upstream.

4. **Complete — build and browser scenario verified:** Local language parser runs shared backend scenarios; chat reports exact peak/risk/SHAP and assumptions. Baseline/branch 3D forecast slider. This is a bounded model-evidence assistant, not a general LLM.

5. **Local implementation verified:** Optional OIDC backend controls and PKCE client/config, version-checked review, metadata access audit, durable in-app replay alerts, explainable cohort neighbours, final-document FHIR references and validated transaction client with receipt/failure tracking. JWT/policy and mock-FHIR tests pass. Actual Keycloak login, hospital delivery, MedCAT packs, Camunda and off-host immutable audit are not provisioned or claimed complete.

6. **Validation harness complete:** Frozen-prediction evaluation, patient-bootstrap intervals, calibration/subgroups and data/provenance validation. Synthetic tests pass. No independent Indian/prospective participant outcomes were supplied; clinical validation remains outstanding.

Live device integrations are paused by user request. No commits or pushes are authorized.

See `DEMO_AND_INTEGRATION_GUIDE.md` for the demo sequence, setup and exact remaining acceptance work.
