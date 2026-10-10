import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { DoctorLogin } from "./pages/DoctorLogin";
import { DoctorDashboard } from "./pages/DoctorDashboard";
import { DoctorVerificationQueue } from "./pages/DoctorVerificationQueue";
import { UnifiedTimeline } from "./pages/UnifiedTimeline";

interface DoctorUser {
  name: string;
  email: string;
  specialty: string;
  hospital: string;
}

function NavigationBar() {
  const location = useLocation();

  const navLinks = [
    { path: "/", label: "01 // Doctor Portal (Patient Tracker & Glycemic Twin)" },
    { path: "/review", label: "02 // Verification Queue" },
    { path: "/timeline", label: "03 // Unified Timeline" },
  ];

  return (
    <nav className="nav-bar-container">
      {navLinks.map((item) => {
        const isActive =
          location.pathname === item.path ||
          (item.path === "/" && (location.pathname === "/twin" || location.pathname === "/dashboard"));
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

  const [doctor, setDoctor] = useState<DoctorUser | null>(() => {
    const saved = localStorage.getItem("ehr-doctor-session");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return {
      name: "Dr. Vikram Malhotra, MD",
      email: "dr.vikram@happiesthealth.com",
      specialty: "Chief Endocrinologist & Diabetologist",
      hospital: "Happiest Health Diabetes Care Centre",
    };
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ehr-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleLogin = (docUser: DoctorUser) => {
    setDoctor(docUser);
    localStorage.setItem("ehr-doctor-session", JSON.stringify(docUser));
  };

  const handleLogout = () => {
    setDoctor(null);
    localStorage.removeItem("ehr-doctor-session");
  };

  return (
    <BrowserRouter>
      {/* Minimalist Top Header */}
      <header className="top-nav">
        <div className="brand-section">
          <div className="brand-icon">+</div>
          <div>
            <div className="brand-title">EHR // Clinical Intelligence</div>
            <div className="brand-subtitle">
              {doctor
                ? `${doctor.hospital} · ${doctor.specialty}`
                : "Type 2 Diabetes Metabolic Digital Twin Platform"}
            </div>
          </div>
        </div>

        <div className="system-status-pills">
          <div className="status-indicator">
            <span className="status-dot green"></span>
            Twin API: 8004
          </div>
          <div className="status-indicator">
            <span className="status-dot"></span>
            Shanghai Cohort: 100 Pts
          </div>

          {/* Logged in Doctor Identity & Sign Out */}
          {doctor && (
            <div
              className="status-indicator"
              style={{
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-strong)",
                fontWeight: 600,
              }}
            >
              <span style={{
                background: "var(--brand-icon-bg)",
                color: "var(--brand-icon-color)",
                padding: "2px 6px",
                borderRadius: "2px",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.5px"
              }}>MD</span>
              <span>{doctor.name}</span>
              <button
                onClick={handleLogout}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "0 4px",
                }}
                title="Sign Out of Doctor Portal"
              >
                Sign Out
              </button>
            </div>
          )}

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

      {/* Render Login Screen if not signed in */}
      {!doctor ? (
        <main style={{ flex: 1, background: "var(--bg-main)" }}>
          <DoctorLogin onLogin={handleLogin} />
        </main>
      ) : (
        <>
          {/* Navigation Sub-Bar */}
          <NavigationBar />

          <main
            style={{
              flex: 1,
              background: "var(--bg-main)",
              transition: "background-color 0.2s ease",
            }}
          >
            <Routes>
              <Route path="/" element={<DoctorDashboard />} />
              <Route path="/twin" element={<DoctorDashboard />} />
              <Route path="/dashboard" element={<DoctorDashboard />} />
              <Route path="/review" element={<DoctorVerificationQueue />} />
              <Route path="/timeline" element={<UnifiedTimeline />} />
            </Routes>
          </main>
        </>
      )}
    </BrowserRouter>
  );
}
