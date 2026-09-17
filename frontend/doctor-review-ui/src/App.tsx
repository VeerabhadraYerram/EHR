import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { PatientDashboard } from "./pages/PatientDashboard";
import { DoctorVerificationQueue } from "./pages/DoctorVerificationQueue";
import { UnifiedTimeline } from "./pages/UnifiedTimeline";

function NavigationBar() {
  const location = useLocation();

  const navLinks = [
    { path: "/", label: "01 // Dashboard" },
    { path: "/review", label: "02 // Verification Queue" },
    { path: "/timeline", label: "03 // Unified Timeline" }
  ];

  return (
    <nav className="nav-bar-container">
      {navLinks.map((item) => {
        const isActive = location.pathname === item.path || (item.path === "/" && location.pathname === "/dashboard");
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link-item ${isActive ? "active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ehr-theme") as "light" | "dark") || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ehr-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <BrowserRouter>
      {/* Minimalist Top Header */}
      <header className="top-nav">
        <div className="brand-section">
          <div className="brand-icon">+</div>
          <div>
            <div className="brand-title">EHR // Clinical Intelligence</div>
            <div className="brand-subtitle">Heterogeneous NLP Ingestion &amp; EMPI Identity Fusion</div>
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
            <span className="status-dot"></span>
            EMPI: 8002
          </div>
          <div className="status-indicator">
            <span className="status-dot"></span>
            Fusion: 8003
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            title="Toggle Bright / Dark Mode"
          >
            <span>{theme === "light" ? "◐" : "◑"}</span>
            <span>{theme === "light" ? "Bright Mode" : "Dark Mode"}</span>
          </button>
        </div>
      </header>

      {/* Navigation Sub-Bar */}
      <NavigationBar />

      <main style={{ flex: 1, background: "var(--bg-main)", transition: "background-color 0.2s ease" }}>
        <Routes>
          <Route path="/" element={<PatientDashboard />} />
          <Route path="/dashboard" element={<PatientDashboard />} />
          <Route path="/review" element={<DoctorVerificationQueue />} />
          <Route path="/timeline" element={<UnifiedTimeline />} />
          <Route path="/fhir" element={<div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>FHIR PERSISTENCE STORE // WEEK 7</div>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
