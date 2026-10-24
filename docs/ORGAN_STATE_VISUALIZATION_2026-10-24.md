# Organ state visualization checkpoint

The app can personalize the displayed measurements, sex-matched atlas selection,
estimated body habitus, and a removable systemic glucose overlay. It cannot infer
individual pancreas volume, renal scarring, liver fat, lung pathology or brain
anatomy from glucose, BMI or eGFR. Local 3D contours visualize a numeric glucose
legend, not a spatial disease heatmap or measured tissue glucose concentration.

## Implemented

- Anatomy inspector: Patient data, Simulation, Layers & view; always available organ selection.
- Baseline/what-if selection from the existing shared model response. Exact 15-minute
  horizons, recorded state at zero, sensitivity ranges and same-horizon differences.
- Play/pause advances through exact horizons; returning to zero loops the preview.
- Forecast 3D panel uses the same selection helper; patient/recording changes reset horizon.
- Model/recording patient and baseline/response timestamps must all match.
- Missing forecasts, branches, horizons and organ measurements stay unavailable.
- Overlay mode uses local 3D; choosing an online reference turns off the overlay.
  Online embeds receive no patient data and their geometry is not controllable by this app.
- Kidney local material is darker and less glossy. No kidney mesh replacement or
  improvement to the publisher's online kidney geometry is claimed.
- Signed SHAP chart displays genuine backend contributions in raw log-odds, with
  selectable explanations, source feature values and direction/magnitude ordering.
- Forecast workspace panels and descriptive overview launch cards reduce page stacking.

## Clinical boundaries and sources

NIDDK describes GFR as a kidney-function test, while other tests and imaging are
used for diagnosis. We do not convert eGFR into kidney dimensions, percentage
function, local tissue damage or a chronic disease diagnosis.

- https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/tests-diagnosis
- https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/kidney-disease/laboratory-evaluation/estimated-gfr-calculators/adults-pediatrics.

Actual patient-specific organ geometry needs appropriately acquired and segmented
imaging. The existing synthetic-scan pipeline remains separate and explicitly synthetic.
The trained endpoint remains glucose. What-if trajectories are assumption-based
estimates, not validated organ recovery or treatment outcomes.

## Verification

Nine organ evidence, visualization and phenotype tests passed. Build and lint passed.
Browser checked exact +75-minute baseline161.5/walk148.0 mg/dL, +120-minute baseline159.0,
patient-context reset, all24 SHAP factors and clickable explanation, local3D rendering,
and390px viewport without horizontal overflow. Fresh-page console had no errors after
the shader update; an HMR stale-material uniform issue was guarded and clean-load tested.
Existing renderer bundle size advisory remains. No commits or pushes.
