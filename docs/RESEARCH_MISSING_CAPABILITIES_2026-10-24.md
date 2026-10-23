# Research and implementation roadmap for remaining capabilities

Reviewed 24 October 2026 (IST). This is a research deliverable, not a claim that the integrations below have shipped. Existing twin artwork is deliberately unchanged. The implementation proposals preserve the boundaries in `project_docs/EHR_Architecture_Document.md`.

Firecrawl CLI was checked first: installed/authenticated, but the verification scrape failed with `getaddrinfo ENOTFOUND api.firecrawl.dev`. Primary-source research therefore used the available web tool. Links below were inspected during this research; large asset archives, model weights, provider accounts and hospital systems were not downloaded or connected.

## 1. Real 3D anatomical assets

| Candidate | Verified source, format and license | Fit for this repository |
|---|---|---|
| **BodyParts3D official archive — recommended starting point** | [Download catalog](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) lists `isa_BP3D_4.0_obj_99.zip` (136 MB) and `partof_BP3D_4.0_obj_99.zip` (62 MB), containing OBJ polygon meshes and organ-name/ID tables. [Official license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), updated 27 February 2025, specifies **CC BY 4.0** with attribution. | Start with the PART-OF organ hierarchy; extract body, heart, brain, pancreas and kidneys into named GLB assets. The reference anatomy is an adult male atlas, not any of the 100 patients' scanned anatomy. |
| **Z-Anatomy** | [Maintainer repository](https://github.com/Z-Anatomy/Models-of-human-anatomy) contains the Blender template/archive `Z-Anatomy.zip`; README declares **CC BY-SA 4.0**. It also explicitly lists included/adapted inner-ear and kidney material with **CC BY-NC-SA / CC BY-NC** terms. | Useful for atlas exploration and an educational demo, but inspect the exact selected objects before commercial redistribution. Do not assume the headline share-alike license clears every included asset. |
| BodyParts3D STL conversion | [Geometry conversion repository](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) supplies STL converted from original OBJ, with MIT processing code and its own older **CC BY-SA 2.1 Japan** geometry statement. | Convenient previews, but prefer the original archive plus its current license record. Preserve the terms of whichever distribution is actually acquired. |

BodyParts3D archive attribution should identify the database, Database Center for Life Science, and CC BY 4.0; record the source URL, acquisition date and any mesh changes. Its current official license differs from historical notices in mirrors. Z-Anatomy derivative model assets require the applicable share-alike terms, with any third-party restrictions checked separately. No asset here should be represented as patient-specific.

### Proposed future viewer implementation

1. Keep the present anatomy tab working and add the mesh viewer behind a feature flag when the user resumes twin work.
2. Create an asset manifest containing organ ID, original filename, source, license, attribution, checksum, dimensions and transforms. Store assets separately from application code licenses.
3. Use Blender offline to inspect each source mesh, correct transforms/normals, retain independent organ names, simplify geometry, then export GLB. Keep source meshes and an automated conversion script for reproducibility.
4. In React, lazy-load the viewer and selected organs. Use raycasting for selection; add orbit controls, isolate/hide, opacity, labels, reset camera and keyboard-accessible organ selection. Preserve existing physiological overlays as clearly labeled derived estimates.
5. Test load failures, low-end devices, reduced motion, organ selection, scale/orientation and mobile touch interaction. The suggested initial download budget is a project target, not an observed source-asset property.

[Three.js documentation](https://threejs.org/docs/) provides the rendering/loaders/controls APIs. Run converted output through the [Khronos glTF validator](https://github.com/KhronosGroup/glTF-Validator) before release. This plan adds geometry; geometry alone does not make the existing risk model a mechanistic organ simulator.

## 2. Patient-specific organs reconstructed from CT or MRI

[TotalSegmentator](https://github.com/wasserth/TotalSegmentator) accepts NIfTI or a patient's DICOM series and supports CT and MRI segmentation. Its README distinguishes openly usable Apache-2.0 tasks, including `total` and `total_mr`, from tasks requiring separate licenses. Choose and pin the task and model weights explicitly; a free academic license for a restricted task does not imply commercial rights. The project states it is not itself a medical device.

[3D Slicer segmentations](https://slicer.readthedocs.io/en/5.4/user_guide/modules/segmentations.html) supports reviewed segmentation export to STL/OBJ. Its [data-format documentation](https://github.com/Slicer/Slicer/blob/main/Docs/user_guide/data_loading_and_saving.md) also describes segmentation volumes, coordinate conventions and an OpenAnatomy glTF export extension.

**Proposed pipeline:** authorized DICOM upload → patient/series identity verification → immutable original in private MinIO → asynchronous segmentation worker → clinician review in Slicer → approved mask and measured organ volumes → surface export → checked/optimized GLB → patient-linked manifest → frontend viewer.

Keep large segmentation jobs outside the synchronous twin prediction route. A proposed job schema is `job_id`, `patient_id`, `study_uid`, `series_uid`, `input_hash`, `modality`, `task`, `model_version`, `status`, `reviewer`, `reviewed_at`, `mask_uri`, `mesh_uri` and `coordinate_transform`. Return progress and an explicit failed/unsupported state rather than silently displaying generic anatomy as a successful reconstruction.

Acceptance requires a known test series, verified patient linkage, preserved voxel spacing and orientation, segmentation review, reconstruction provenance, access control, an export checksum and a comparison against manually reviewed masks. Suggested evaluation includes Dice, surface distance, organ-volume error and failure analysis by scanner/protocol. A CT abdomen does not contain a full scanned brain or body: show only available anatomy. There are no patient scans supplied by the current CGM/EHR cohort, so its lab values cannot reconstruct exact patient organs.

## 3. Live wearables and sensor ingestion

[Dexcom's official getting-started guide](https://developer.dexcom.com/docs/dexcom/getting-started) describes developer registration, sandbox testing and limited/full access; limited access allows testing with up to five real-data users. [Scopes and access](https://developer.dexcom.com/docs/dexcom/scopes-access) governs permitted endpoints/access. Do not promise real-time availability, geography or production approval until the selected provider confirms the application's access tier.

[Android Health Connect](https://developer.android.com/health-and-fitness/health-connect/read-data) provides permission-controlled reads of supported health records. It needs a native Android companion; it is not a browser API that the current React dashboard can call directly.

**Proposed repository adapter:** normalize provider records into `{patient_id, device_id, source, source_record_id, observed_at, received_at, measurement, value, unit, quality}`; publish through the ingestion/Kafka boundary; validate units/timezone/plausibility; deduplicate by provider ID; retain late/out-of-order events. Maintain an explicit `replay`, `sandbox` or `live` source state. Recompute the shared prediction only after a complete accepted feature window, and mark stale or missing inputs. Expose SSE/WebSocket updates from the backend, retaining polling/reconnect fallback.

The first meaningful milestone is an authenticated sandbox adapter with replayable fixtures and a disconnect/staleness test. Real-device acceptance requires a consented account/device and comparison of received readings/timestamps against the provider export. Credentials remain server-side.

## 4. Genomic functionality

[nf-core/sarek usage](https://nf-co.re/sarek/docs/usage/) documents reproducible preprocessing, germline/somatic variant calling and annotation workflows with pinned Nextflow releases. Its [workflow license](https://github.com/nf-core/sarek/blob/master/LICENSE) is MIT; each bundled tool/reference database still needs its own license review.

**Proposed first scope:** accept an already generated VCF plus reference build and sample identity; validate metadata and consent; show real uploaded variants and annotation provenance in the current explorer. Keep the fixed demonstration sequence explicitly labeled until then. Later, run FASTQ/BAM processing as an asynchronous separate service with pinned references/tool versions, QC and controlled storage. Do not convert the existing sample sequence into a claim of diabetes genetic-risk prediction. A genetic-risk model needs a defined clinical question and independent validation of its intended population.

## 5. Authentication, authorization and audit

[Keycloak's OIDC guide](https://www.keycloak.org/securing-apps/oidc-layers) documents discovery, authorization/token endpoints and public keys for token verification. Use authorization-code flow with PKCE for the browser client, a configured issuer/audience and server-side signature/expiry verification. The guide discourages implicit flow and password grants.

**Proposed roles:** clinician reads assigned records and reviews entities; reviewer finalizes verified records; administrator manages identities/access; research role sees only approved deidentified data. The precise role assignment is a project policy to agree before production. Enforce access in every backend, with gateway checks as an additional layer. Hiding buttons in React is insufficient.

Add a dedicated audit-service append endpoint and middleware for record reads, exports, inference, verification, persistence and failed authorization. Record actor, role, patient/resource identifier, action, outcome, request/correlation ID and timestamp, without copying clinical text or credentials into logs. Use restricted database permissions and retained off-host/WORM copies; a mutable local JSON file or a hash chain alone is not proof of immutability.

FHIR [AuditEvent](https://hl7.org/fhir/R4/auditevent.html) represents security-relevant events. [Provenance](https://hl7.org/fhir/R4/provenance.html) records how a clinical resource was created or changed. Preserve both responsibilities rather than using one as a substitute for the other.

## 6. Doctor verification, deduplication and clinical NLP

Implement within the existing clinical-processing, verification and workflow service boundaries. Proposed deduplication compares normalized terminology code, value/unit and time interval, preserving source references. Conflicting values create review items rather than silently overwriting each other. Review actions need optimistic version checks, reviewer identity and an audit trail. Finalization should be blocked until required review items are resolved.

The repository architecture specifies MedCAT/scispaCy/context classification plus terminology services. Load their models and terminology releases as separately versioned dependencies; do not report the dictionary baseline as equivalent to the full stack. A bounded milestone is a persisted review queue with accept/edit/reject, a conflict example and tests for negation, historical findings and source provenance. Later evaluate a labeled sample set from the intended documentation setting before replacing the baseline extractor.

## 7. FHIR and hospital persistence

[HAPI FHIR's JPA starter](https://hapifhir.io/hapi-fhir/docs/server_jpa/get_started.html) supplies a FHIR server supporting resource operations and configurable storage including PostgreSQL. Run it as a separate service; keep the existing interoperability service as the translator/validator/client.

Proposed finalization flow: verified canonical record → FHIR R4 resources → explicit profile validation → transaction submission → inspect transaction-response/OperationOutcome → store returned resource IDs/versions → append audit and provenance. Retries must be idempotent. A JSON bundle download is a separate successful operation from successful hospital persistence.

The [NRCeS ABDM implementation-guide entry point](https://nrces.in/ndhm/fhir/r4/) is the Indian integration starting point. A [preview build inspected during research](https://www.nrces.in/preview/ndhm/fhir/r4/index.html) identifies itself as a local development build/draft. Pin the selected published package and FHIR version in validation; do not silently target an evolving preview or claim ABDM certification from merely producing R4 JSON. Real ABDM or hospital deployment additionally requires the counterpart's credentials, environment and conformance process.

For legacy HL7 v2, preserve the architecture's interoperability boundary: transform the same verified record, track message-control IDs, parse ACK/NACK and retain delivery state. Select and license the actual interface-engine release before deployment; the architecture's historical description of a product is not a current license audit.

## 8. Similar cases and generated documents

Keep similarity retrieval in `services/recommendation`: filter to permitted historical cases, version embeddings, retain doctor/outcome provenance, and expose why a case matched. Empty or insufficient data should return an honest empty state. Similarity is not evidence that a prior treatment is suitable for the current patient.

Keep template generation in `services/document-generation`: populate a treatment-plan/discharge-summary template from verified facts, retain source/entity references, require clinician review and persist version/finalization state. Provide downloadable HTML/PDF and map finalized documents to FHIR document resources. Missing facts remain blank/flagged; avoid inventing diagnoses or medication instructions.

## 9. Alerts and escalation

[Prometheus Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/) supplies deduplication, grouping, routing, silences and inhibition for operational alerts. Use it for service/model availability. Patient alert acknowledgment and escalation require their own durable clinical workflow.

Proposed clinical states are `new → acknowledged → resolved`, with `escalated` and `delivery_failed` tracked separately. Store prediction ID, threshold/model version, patient, event time and responsible clinician. Add cooldowns, stale-reading suppression, retries and a visible in-app alert center before integrating consented SMS/email/push providers. Test duplicate events, missing recipient, failed delivery and acknowledgment expiry. A successful API submission is not proof a clinician received or acted on an alert.

## 10. Indian-cohort and prospective validation

The user describes the 100 demonstration records as synthetic data derived from real data. Preserve that provenance clearly and consistently in the manifest, UI and presentation. Synthetic realism does not establish clinical equivalence, Indian generalizability or prospective safety. Check existing source files before asserting whether any individual measurements are original, resampled or synthetic.

[TRIPOD+AI](https://www.tripod-statement.org/) provides a reporting checklist for prediction-model development and evaluation. Proposed evaluation plan: freeze model/threshold/endpoint; split by patient and acquisition time/source; compare with simple baselines; report calibration, sensitivity, precision, AUPRC, event counts, confidence intervals and subgroup performance. Then evaluate a separately obtained Indian cohort, followed by a consented, appropriately reviewed silent prospective study where predictions do not change care. Prospective usefulness requires lead time, alert burden, missed events and workflow outcomes in addition to classifier scores. These stages require real participants/partners and cannot be completed by repository code alone.

## 11. Submission package

This is a proposed packaging checklist, not a claim that the complete event-specific GitHub submission rules have been verified. Use the official challenge instructions/organizer communication as final authority.

- Reproducible README with actual startup commands, ports, dependency/model versions, CPU/GPU requirements and a clean-machine path.
- Architecture diagram and implemented-versus-proposed feature table.
- Dataset/model card specifying synthetic derivation, source licenses, splits, limitations and saved reproducible metrics.
- Short demo covering initial patient load, timeline selection, a shared prediction across panels, model explanation, intervention comparison and review/export.
- Screenshots/video, team details, citations and asset attribution; no secrets or private records.
- Validation report including failed checks and external dependencies; a frozen submission commit/tag after the user authorizes committing.

## 12. Proposed delivery order and acceptance

| Phase | Work | Evidence required |
|---|---|---|
| Current reliability | Correct routing, initial data, shared prediction, genuine model explanations, multipage UI and usable simulation/review | Browser walkthrough and passing relevant API/UI checks |
| Complete local workflows | Persisted verification, deduplication/provenance, template documents, in-app alerts | Restart persistence, conflict/finalization tests, export comparison |
| External platform integration | Keycloak, HAPI/validator, central audit, provider sandbox adapters | Real configured dependencies, unauthorized-access tests, validated persisted resources, sandbox ingest evidence |
| Anatomy phase when resumed | Licensed atlas meshes, then consented scan pipeline | Asset manifest/license checks, mesh QA, reviewed segmentation and geometry measurements |
| Clinical research | Independent Indian cohort and silent prospective evaluation | Approved protocol, locked analysis, independently collected data and reported outcomes |

The phases are proposed engineering sequencing. No timing or completion of external credential, licensing, hardware, hospital access or clinical-study prerequisites is assumed.
