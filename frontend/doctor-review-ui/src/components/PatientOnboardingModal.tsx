import React, { useState } from "react";
import { XIcon, SmartphoneIcon, SparklesIcon } from "./Icons";

export interface PatientOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (patientName: string) => void;
}

export const PatientOnboardingModal: React.FC<PatientOnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState({
    name: "Aarav Sharma",
    age: 52,
    sex: "Male",
    bmi: 26.8,
    yearsWithDiabetes: 7,
    hba1c: 8.4,
    cPeptide: 1.15,
    egfr: 82,
    medication: "Metformin 1000mg BID",
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          setStep(3);
          return 100;
        }
        return prev + 25;
      });
    }, 300);
  };

  const handleFinalSubmit = () => {
    onComplete(formData.name);
    onClose();
  };

  return (
    <div className="fhir-modal-overlay" onClick={onClose}>
      <div className="onboarding-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="fhir-modal-header">
          <div className="fhir-title-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SmartphoneIcon size={20} color="#0ea5e9" />
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)" }}>
                Patient Onboarding & Digital Twin Initialization Wizard
              </h3>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--text-secondary)" }}>
              Step-by-step pairing of continuous sensor telemetry with clinical hospital EHR records
            </p>
          </div>
          <button className="fhir-close-btn" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        {/* Step Indicator Header */}
        <div className="wizard-step-indicator">
          {[
            { num: 1, title: "EHR Demographics" },
            { num: 2, title: "Wearable NFC Scan" },
            { num: 3, title: "Dual-Stream Calibration" },
            { num: 4, title: "Twin Active" },
          ].map((s) => (
            <div key={s.num} className={`step-item ${step === s.num ? "active" : step > s.num ? "completed" : ""}`}>
              <div className="step-circle">{step > s.num ? "✓" : s.num}</div>
              <span className="step-title">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Step 1: EHR Record & Lab Inputs */}
        {step === 1 && (
          <div className="wizard-step-content">
            <h4 className="wizard-heading">Step 1: Patient Hospital Profile & Laboratory Biomarkers</h4>
            <p className="wizard-desc">
              Enter verified clinical record values. Fasting C-Peptide and BMI directly calibrate the endogenous beta-cell capacity and peripheral resistance modifiers.
            </p>
            <div className="wizard-form-grid">
              <div className="wizard-field">
                <label>Full Patient Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label>Age (Years)</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                />
              </div>
              <div className="wizard-field">
                <label>BMI (kg/m²)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.bmi}
                  onChange={(e) => setFormData({ ...formData, bmi: Number(e.target.value) })}
                />
              </div>
              <div className="wizard-field">
                <label>Fasting C-Peptide (ng/mL)</label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.cPeptide}
                  onChange={(e) => setFormData({ ...formData, cPeptide: Number(e.target.value) })}
                />
              </div>
              <div className="wizard-field">
                <label>Laboratory HbA1c (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.hba1c}
                  onChange={(e) => setFormData({ ...formData, hba1c: Number(e.target.value) })}
                />
              </div>
              <div className="wizard-field">
                <label>Estimated GFR (mL/min/1.73m²)</label>
                <input
                  type="number"
                  value={formData.egfr}
                  onChange={(e) => setFormData({ ...formData, egfr: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="wizard-actions">
              <button className="wizard-btn next" onClick={() => setStep(2)}>
                Proceed to Wearable Pairing →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Wearable CGM NFC Scan */}
        {step === 2 && (
          <div className="wizard-step-content text-center">
            <h4 className="wizard-heading">Step 2: Continuous Wearable Sensor Pairing</h4>
            <p className="wizard-desc">
              Hold the clinician tablet or smartphone companion near the patient's Abbott FreeStyle Libre sensor to initiate encrypted Bluetooth BLE / NFC telemetry stream.
            </p>
            <div className="sensor-pairing-card">
              <div className={`sensor-nfc-pulse ${isScanning ? "scanning" : ""}`}>
                <SmartphoneIcon size={38} color="#0ea5e9" />
              </div>
              <div className="sensor-pairing-text">
                <strong>{isScanning ? `Syncing Telemetry... ${scanProgress}%` : "Abbott FreeStyle Libre 3"}</strong>
                <span>NFC Telemetry · 15-Minute Intermittent Glucose Cadence</span>
              </div>
              {isScanning && (
                <div className="sensor-scan-track">
                  <div className="sensor-scan-bar" style={{ width: `${scanProgress}%` }}></div>
                </div>
              )}
            </div>
            <div className="wizard-actions">
              <button className="wizard-btn secondary" onClick={() => setStep(1)} disabled={isScanning}>
                ← Back
              </button>
              <button className="wizard-btn next" onClick={handleSimulateScan} disabled={isScanning}>
                {isScanning ? "Scanning Sensor..." : "Simulate Instant NFC Pair →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dual-Stream Calibration */}
        {step === 3 && (
          <div className="wizard-step-content">
            <h4 className="wizard-heading">Step 3: Dual-Stream Calibration & Feature Vector Fusion</h4>
            <p className="wizard-desc">
              The Digital Twin merges 10 static EHR clinic parameters with 14 dynamic wearable CGM features into a 24-feature calibrated vector.
            </p>
            <div className="calibration-checklist">
              <div className="checklist-row done">
                <span className="chk-icon">✓</span>
                <span>EHR Demographic & Lab Ingestion (HbA1c: {formData.hba1c}%, C-Peptide: {formData.cPeptide} ng/mL)</span>
              </div>
              <div className="checklist-row done">
                <span className="chk-icon">✓</span>
                <span>CGM Wearable Telemetry Synchronized (96 intervals / 24 hours verified)</span>
              </div>
              <div className="checklist-row done">
                <span className="chk-icon">✓</span>
                <span>Isotonic Probability Calibration & XGBoost Multi-Horizon Regressor Fitted</span>
              </div>
              <div className="checklist-row done">
                <span className="chk-icon">✓</span>
                <span>RSSDI Indian Phenotype Glycemic Safety Guardrails Active</span>
              </div>
            </div>
            <div className="wizard-actions">
              <button className="wizard-btn next" onClick={() => setStep(4)}>
                Deploy Digital Twin →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Twin Active Confirmation */}
        {step === 4 && (
          <div className="wizard-step-content text-center">
            <div className="twin-active-badge-large">
              <SparklesIcon size={44} color="#10b981" />
            </div>
            <h4 className="wizard-heading" style={{ color: "#10b981" }}>
              Digital Twin Successfully Initialized for {formData.name}
            </h4>
            <p className="wizard-desc">
              The dynamic virtual twin replica is now receiving live telemetry, calculating 2-hour forward forecast curves, and monitoring for imminent spikes before clinical onset.
            </p>
            <div className="wizard-actions center">
              <button className="wizard-btn success" onClick={handleFinalSubmit}>
                Open Live Dashboard for {formData.name}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
