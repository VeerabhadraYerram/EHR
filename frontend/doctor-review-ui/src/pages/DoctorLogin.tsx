import { useState } from "react";

interface DoctorLoginProps {
  onLogin: (doctor: { name: string; email: string; specialty: string; hospital: string }) => void;
}

export function DoctorLogin({ onLogin }: DoctorLoginProps) {
  const [email, setEmail] = useState("dr.vikram@happiesthealth.com");
  const [password, setPassword] = useState("twin2026");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    // Authenticate
    onLogin({
      name: "Dr. Vikram Malhotra, MD",
      email: email.trim(),
      specialty: "Chief Endocrinologist & Diabetologist",
      hospital: "Happiest Health Diabetes Care Centre",
    });
  };

  const handleQuickLogin = (name: string, spec: string, mail: string) => {
    onLogin({
      name,
      email: mail,
      specialty: spec,
      hospital: "Happiest Health Diabetes Care Centre",
    });
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card-container">
        {/* Header Branding */}
        <div className="login-brand-header">
          <div className="login-brand-badge">+</div>
          <h1 className="login-title">Doctor Intelligence Portal</h1>
          <p className="login-subtitle">
            Metabolic Digital Twin & Ambulatory Continuous Glucose Management
          </p>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error-alert">{error}</div>}

          <div className="login-field-group">
            <label className="login-field-label">Doctor Email / Clinical ID</label>
            <input
              type="email"
              className="login-input-control"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="e.g. dr.vikram@happiesthealth.com"
              required
            />
          </div>

          <div className="login-field-group">
            <label className="login-field-label">Security Passcode</label>
            <input
              type="password"
              className="login-input-control"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="login-submit-btn">
            Sign In to Clinical Workspace
          </button>
        </form>

        {/* 1-Click Demo Doctor Access */}
        <div className="login-demo-divider">
          <span>Or Quick 1-Click Clinician Sign-In</span>
        </div>

        <div className="login-demo-grid">
          <button
            type="button"
            className="login-demo-card"
            onClick={() =>
              handleQuickLogin(
                "Dr. Vikram Malhotra, MD",
                "Chief Diabetologist & Endocrinologist",
                "dr.vikram@happiesthealth.com"
              )
            }
          >
            <div className="demo-avatar">VM</div>
            <div className="demo-info">
              <div className="demo-name">Dr. Vikram Malhotra, MD</div>
              <div className="demo-spec">Chief Diabetologist · Endocrinology</div>
            </div>
            <span className="demo-arrow">→</span>
          </button>

          <button
            type="button"
            className="login-demo-card"
            onClick={() =>
              handleQuickLogin(
                "Dr. Ananya Iyer, MD",
                "Consultant Diabetologist",
                "dr.ananya@happiesthealth.com"
              )
            }
          >
            <div className="demo-avatar">AI</div>
            <div className="demo-info">
              <div className="demo-name">Dr. Ananya Iyer, MD</div>
              <div className="demo-spec">Consultant Diabetologist · Metabolic Health</div>
            </div>
            <span className="demo-arrow">→</span>
          </button>
        </div>

        {/* Feature Highlights */}
        <div className="login-features-footer">
          <div className="feature-pill">
            <span className="pill-dot green"></span> 100 Clinical T2DM Patients
          </div>
          <div className="feature-pill">
            <span className="pill-dot amber"></span> Live Wearable Telemetry
          </div>
          <div className="feature-pill">
            <span className="pill-dot cyan"></span> 2h Forward Spike Predictor
          </div>
        </div>
      </div>
    </div>
  );
}
