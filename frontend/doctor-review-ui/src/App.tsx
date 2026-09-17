import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PatientDashboard } from "./pages/PatientDashboard";

export default function App() {
  return (
    <BrowserRouter>
      {/* Platform Top Header */}
      <header className="top-nav">
        <div className="brand-section">
          <div className="brand-icon">⚕</div>
          <div>
            <div className="brand-title">EHR Clinical Intelligence Platform</div>
            <div className="brand-subtitle">Clinical NLP & HL7/FHIR Ingestion Pipeline</div>
          </div>
        </div>

        <div className="system-status-pills">
          <div className="status-indicator">
            <span className="status-dot"></span>
            PostgreSQL: 5432
          </div>
          <div className="status-indicator">
            <span className="status-dot"></span>
            MinIO S3: 9000
          </div>
          <div className="status-indicator">
            <span className="status-dot" style={{ backgroundColor: "#3b82f6", boxShadow: "0 0 8px #3b82f6" }}></span>
            Terminology: 5433
          </div>
          <div className="status-indicator">
            <span className="status-dot" style={{ backgroundColor: "#8b5cf6", boxShadow: "0 0 8px #8b5cf6" }}></span>
            NLP Baseline: Active
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<PatientDashboard />} />
          <Route path="/dashboard" element={<PatientDashboard />} />
          <Route path="/review" element={<div style={{ padding: 40, textAlign: "center" }}>Doctor Verification Task Queue (Week 5)</div>} />
          <Route path="/fhir" element={<div style={{ padding: 40, textAlign: "center" }}>FHIR Persistence Store (Week 7)</div>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
