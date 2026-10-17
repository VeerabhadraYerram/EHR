import React, { useState, useEffect } from "react";

export interface PrescribedIntervention {
  intervention_type: string;
  label: string;
  icon: string;
  mechanism: string;
  simulated_peak_mg_dl: number;
  peak_reduction_mg_dl: number;
  clarke_zone: string;
}

interface PatientCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientId: string;
  currentTime: string;
  currentGlucose: number;
  projectedPeak: number;
  prescribedIntervention: PrescribedIntervention | null;
  onActionConfirmed?: (actionName: string) => void;
}

export const PatientCompanionModal: React.FC<PatientCompanionModalProps> = ({
  isOpen,
  onClose,
  patientName,
  patientId,
  currentTime,
  currentGlucose,
  projectedPeak,
  prescribedIntervention,
  onActionConfirmed,
}) => {
  // Device view switcher: Phone vs Watch
  const [deviceMode, setDeviceMode] = useState<"phone" | "watch">("phone");

  // Interaction states
  const [hasAcknowledged, setHasAcknowledged] = useState<boolean>(false);
  const [walkActive, setWalkActive] = useState<boolean>(false);
  const [walkSecondsLeft, setWalkSecondsLeft] = useState<number>(20 * 60);
  const [stepsCount, setStepsCount] = useState<number>(140);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "doctor" | "patient"; text: string; time: string }>>([]);
  const [showFhirWire, setShowFhirWire] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"nudge" | "vision" | "chat">("nudge");

  // Default intervention if none explicitly selected
  const activePrescription: PrescribedIntervention = prescribedIntervention || {
    intervention_type: "postprandial_walk",
    label: "20-Minute Brisk Walk",
    icon: "walk",
    mechanism: "Biophysical GLUT4 Translocation: Stimulates non-insulin-mediated glucose disposal Rd(t).",
    simulated_peak_mg_dl: 154,
    peak_reduction_mg_dl: 18.5,
    clarke_zone: "Zone A (Safe)",
  };

  // Reset or initialize when modal opens or prescription changes
  useEffect(() => {
    if (isOpen) {
      setHasAcknowledged(false);
      setWalkActive(false);
      setWalkSecondsLeft(20 * 60);
      setStepsCount(140);
      setChatMessages([
        {
          sender: "doctor",
          text: `Rohan, your postprandial glucose is ascending rapidly. Our digital twin projects an excursion to ${projectedPeak} mg/dL. Please start your ${activePrescription.label} to blunt the excursion.`,
          time: currentTime || "12:45",
        },
      ]);
    }
  }, [isOpen, activePrescription, projectedPeak, currentTime]);

  // Workout timer ticker when active
  useEffect(() => {
    if (!walkActive) return;
    const interval = setInterval(() => {
      setWalkSecondsLeft((prev) => Math.max(0, prev - 1));
      setStepsCount((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [walkActive]);

  if (!isOpen) return null;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleConfirmAction = () => {
    setHasAcknowledged(true);
    setWalkActive(true);
    const confirmTime = currentTime || "12:47";
    setChatMessages((prev) => [
      ...prev,
      {
        sender: "patient",
        text: `I've started my ${activePrescription.label}. Stepping out now!`,
        time: confirmTime,
      },
      {
        sender: "doctor",
        text: `Excellent. Telemetry sync active. Your simulated peak will attenuate to ${activePrescription.simulated_peak_mg_dl} mg/dL (Clarke Zone A).`,
        time: confirmTime,
      },
    ]);
    if (onActionConfirmed) {
      onActionConfirmed(activePrescription.label);
    }
  };

  // HL7 FHIR payload representation sent over the air
  const fhirWireJson = JSON.stringify(
    {
      resourceType: "CommunicationRequest",
      id: `cr-nudge-${patientId}-${Date.now()}`,
      status: hasAcknowledged ? "completed" : "active",
      priority: "urgent",
      category: [
        {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/communication-category", code: "alert" }],
        },
      ],
      subject: { reference: `Patient/${patientId}`, display: patientName },
      sender: { reference: "Practitioner/DR-VIKRAM-MD", display: "Dr. Vikram Malhotra, MD" },
      payload: [
        {
          contentString: `Prescribed CarePlan: ${activePrescription.label}. Expected glycemic reduction: -${activePrescription.peak_reduction_mg_dl} mg/dL (Attenuated Peak: ${activePrescription.simulated_peak_mg_dl} mg/dL). ${activePrescription.mechanism}`,
        },
      ],
      occurrenceDateTime: new Date().toISOString(),
      extension: [
        {
          url: "http://happiesthealth.org/fhir/StructureDefinition/clarke-safety-zone",
          valueString: activePrescription.clarke_zone,
        },
        {
          url: "http://happiesthealth.org/fhir/StructureDefinition/closed-loop-status",
          valueString: hasAcknowledged ? "ACKNOWLEDGED_BY_PATIENT" : "PENDING_DELIVERY",
        },
      ],
    },
    null,
    2
  );

  return (
    <div className="companion-modal-overlay" onClick={onClose}>
      <div className="companion-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Control Header Bar */}
        <div className="companion-dialog-header">
          <div className="header-meta">
            <span className="closed-loop-tag">
              <span className="pulse-ping"></span>
              CLOSED-LOOP PATIENT COMPANION
            </span>
            <h3 className="companion-title">Mobile Device Telemetry & CarePlan Receiver</h3>
            <span className="companion-subtitle">
              Demonstrating bi-directional doctor ↔ patient push synchronization
            </span>
          </div>

          <div className="header-controls">
            {/* Device Switcher (Phone / Watch) */}
            <div className="device-switcher-pill">
              <button
                className={`switch-btn ${deviceMode === "phone" ? "active" : ""}`}
                onClick={() => setDeviceMode("phone")}
              >
                📱 Phone
              </button>
              <button
                className={`switch-btn ${deviceMode === "watch" ? "active" : ""}`}
                onClick={() => setDeviceMode("watch")}
              >
                ⌚ Smartwatch
              </button>
            </div>

            <button
              className={`fhir-toggle-btn ${showFhirWire ? "active" : ""}`}
              onClick={() => setShowFhirWire(!showFhirWire)}
              title="Inspect over-the-air HL7 FHIR payload"
            >
              {showFhirWire ? "Hide FHIR" : "Inspect FHIR Wire"}
            </button>

            <button className="companion-close-btn" onClick={onClose} aria-label="Close Companion Simulator">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="companion-dialog-body">
          {/* LEFT: FHIR Wire Inspector (Collapsible) */}
          {showFhirWire && (
            <div className="companion-fhir-panel">
              <div className="fhir-panel-header">
                <span className="fhir-panel-title">HL7 FHIR R4 CommunicationRequest</span>
                <span className="fhir-panel-status">
                  Status: <strong>{hasAcknowledged ? "COMPLETED" : "DELIVERED"}</strong>
                </span>
              </div>
              <pre className="fhir-json-view">{fhirWireJson}</pre>
            </div>
          )}

          {/* RIGHT / MAIN: Hardware Device Simulator */}
          <div className="companion-device-stage">
            {deviceMode === "phone" ? (
              /* SMARTPHONE FRAME */
              <div className="phone-device-frame">
                {/* Hardware Bezel & Buttons */}
                <div className="phone-earpiece-notch">
                  <div className="dynamic-island">
                    <span className="sensor-pulse-dot"></span>
                    <span className="island-text">Abbott Libre CGM: {currentGlucose} mg/dL</span>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="phone-status-bar">
                  <span className="phone-clock">{currentTime || "12:45"}</span>
                  <div className="phone-status-icons">
                    <span>5G</span>
                    <span>●●●●</span>
                    <span>94% 🔋</span>
                  </div>
                </div>

                {/* In-App Header */}
                <div className="phone-app-header">
                  <div className="app-brand-col">
                    <span className="app-logo-badge">H+</span>
                    <div>
                      <div className="app-name">Happiest Health</div>
                      <div className="app-user-line">{patientName} • CGM Linked</div>
                    </div>
                  </div>
                  <div className="app-glucose-badge">
                    <span className="glucose-val">{currentGlucose}</span>
                    <span className="glucose-unit">mg/dL ⇗</span>
                  </div>
                </div>

                {/* Companion App Navigation Tabs */}
                <div className="phone-nav-tabs">
                  <button
                    className={`nav-tab-btn ${activeTab === "nudge" ? "active" : ""}`}
                    onClick={() => setActiveTab("nudge")}
                  >
                    🔔 Doctor Nudge
                  </button>
                  <button
                    className={`nav-tab-btn ${activeTab === "vision" ? "active" : ""}`}
                    onClick={() => setActiveTab("vision")}
                  >
                    🍛 Meal Vision
                  </button>
                  <button
                    className={`nav-tab-btn ${activeTab === "chat" ? "active" : ""}`}
                    onClick={() => setActiveTab("chat")}
                  >
                    💬 Chat ({chatMessages.length})
                  </button>
                </div>

                {/* Tab 1: Doctor Nudge & Live Workout Screen */}
                {activeTab === "nudge" && (
                  <div className="phone-tab-content">
                    {/* Incoming Push Notification Card */}
                    <div className="push-alert-card">
                      <div className="push-alert-header">
                        <span className="push-sender-tag">👨‍⚕️ Dr. Vikram Malhotra (CarePlan)</span>
                        <span className="push-time-tag">Just now</span>
                      </div>
                      <div className="push-alert-headline">
                        Urgent Glycemic Alert: Projected Peak {projectedPeak} mg/dL
                      </div>
                      <p className="push-alert-body">
                        "Rohan, glucose climb rate is +24 mg/dL/hr. Please execute <strong>{activePrescription.label}</strong> to stimulate GLUT4 muscle uptake and avert excursion."
                      </p>

                      <div className="push-impact-row">
                        <div className="impact-pill drop">
                          <span>Target Drop:</span>
                          <strong>-{activePrescription.peak_reduction_mg_dl} mg/dL</strong>
                        </div>
                        <div className="impact-pill peak">
                          <span>Averted Peak:</span>
                          <strong>{activePrescription.simulated_peak_mg_dl} mg/dL</strong>
                        </div>
                        <div className="impact-pill safety">
                          <span>Safety:</span>
                          <strong>{activePrescription.clarke_zone}</strong>
                        </div>
                      </div>

                      {!walkActive ? (
                        <button className="confirm-action-btn" onClick={handleConfirmAction}>
                          <span className="btn-icon">🚶</span>
                          <span>I'm Starting My Walk (Confirm Action)</span>
                        </button>
                      ) : (
                        <div className="action-confirmed-tag">
                          ✓ Acknowledged & In Progress at {currentTime || "12:47"}
                        </div>
                      )}
                    </div>

                    {/* Active Workout Monitor Screen (When Walk Active) */}
                    {walkActive && (
                      <div className="active-workout-card">
                        <div className="workout-card-top">
                          <span className="workout-title">⚡ GLUT4 Muscle Uptake Active</span>
                          <span className="workout-live-pill">LIVE TRACKING</span>
                        </div>

                        <div className="workout-timer-circle">
                          <div className="timer-val">{formatTimer(walkSecondsLeft)}</div>
                          <div className="timer-label">REMAINING BRISK WALK</div>
                        </div>

                        <div className="workout-stats-grid">
                          <div className="stat-box">
                            <span className="stat-label">STEPS</span>
                            <span className="stat-num">{stepsCount}</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-label">HEART RATE</span>
                            <span className="stat-num">112 <span className="unit">BPM</span></span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-label">ZONE</span>
                            <span className="stat-num text-success">Zone 2</span>
                          </div>
                        </div>

                        <div className="closed-loop-sync-banner">
                          <span className="sync-icon">📡</span>
                          <span>Bi-directional sync active: Dr. Vikram Malhotra notified of your exercise.</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Meal Vision AI Screen */}
                {activeTab === "vision" && (
                  <div className="phone-tab-content vision-tab">
                    <div className="meal-card">
                      <div className="meal-card-header">
                        <span className="meal-time-tag">🍛 Lunch Snapshot (12:30 PM)</span>
                        <span className="vision-badge">Vision AI Parsed</span>
                      </div>
                      <div className="meal-title">North Indian Lunch Thali</div>
                      <div className="meal-items-list">
                        <div className="meal-item">
                          <span>• Dal Makhani (1 cup)</span>
                          <strong>18g CHO</strong>
                        </div>
                        <div className="meal-item">
                          <span>• 2 Tandoori Rotis (Whole wheat)</span>
                          <strong>32g CHO</strong>
                        </div>
                        <div className="meal-item">
                          <span>• Jeera Rice (0.5 cup)</span>
                          <strong>15g CHO</strong>
                        </div>
                      </div>

                      <div className="meal-total-strip">
                        <span>Total Estimated Carbohydrates:</span>
                        <strong className="text-warning">65g CHO</strong>
                      </div>

                      <div className="vision-insight-box">
                        <div className="insight-title">💡 Digital Twin Biophysical Insight</div>
                        <p>
                          High gut absorption rate Ra(t) exceeded insulin-mediated clearance capacity Rd(t), inducing steep +24 mg/dL/hr velocity. A 20-min post-meal walk directly activates contraction-mediated GLUT4 transporters.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Chat Feed Screen */}
                {activeTab === "chat" && (
                  <div className="phone-tab-content chat-tab">
                    <div className="chat-thread">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`chat-bubble-wrap ${msg.sender}`}>
                          <div className="chat-bubble">
                            <div className="chat-meta">
                              {msg.sender === "doctor" ? "Dr. Vikram Malhotra" : "You (Rohan)"} • {msg.time}
                            </div>
                            <div className="chat-text">{msg.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="quick-replies-row">
                      <button
                        className="quick-reply-chip"
                        onClick={() => {
                          setChatMessages((prev) => [
                            ...prev,
                            { sender: "patient", text: "Finished 20 mins! Heading back indoors.", time: currentTime || "13:05" },
                            { sender: "doctor", text: "Excellent, your CGM curve has flattened safely to 148 mg/dL.", time: currentTime || "13:06" },
                          ]);
                        }}
                      >
                        "Finished 20 mins!"
                      </button>
                      <button
                        className="quick-reply-chip"
                        onClick={() => {
                          setChatMessages((prev) => [
                            ...prev,
                            { sender: "patient", text: "Just drank 500mL water and took Metformin.", time: currentTime || "12:50" },
                          ]);
                        }}
                      >
                        "Took Metformin"
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* SMARTWATCH FRAME */
              <div className="watch-device-frame">
                <div className="watch-bezel">
                  <div className="watch-screen">
                    <div className="watch-top-row">
                      <span className="watch-time">{currentTime || "12:45"}</span>
                      <span className="watch-battery">92%</span>
                    </div>

                    <div className="watch-glucose-hero">
                      <div className="watch-glucose-val">{currentGlucose}</div>
                      <div className="watch-glucose-sub">mg/dL ⇗ RISING</div>
                    </div>

                    <div className="watch-alert-strip">
                      <span className="watch-alert-icon">⚠️</span>
                      <span className="watch-alert-text">SPIKE PREDICTED: {projectedPeak}</span>
                    </div>

                    {!walkActive ? (
                      <button className="watch-action-btn" onClick={handleConfirmAction}>
                        <span>START 20M WALK</span>
                      </button>
                    ) : (
                      <div className="watch-active-workout">
                        <div className="watch-timer">{formatTimer(walkSecondsLeft)}</div>
                        <div className="watch-steps">{stepsCount} STEPS • 112 BPM</div>
                        <div className="watch-status">GLUT4 UPTAKE ON</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="companion-dialog-footer">
          <div className="footer-status-indicator">
            <span className={`status-dot ${hasAcknowledged ? "green" : "amber"}`}></span>
            <span>
              {hasAcknowledged
                ? "Closed-Loop State: CarePlan Accepted & Synced with Clinical Record"
                : "Closed-Loop State: Awaiting Patient Haptic Interaction"}
            </span>
          </div>

          <div className="footer-actions">
            <button className="companion-done-btn" onClick={onClose}>
              Return to Clinical Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
