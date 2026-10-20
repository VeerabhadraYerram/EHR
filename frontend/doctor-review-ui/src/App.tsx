import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { DoctorLogin } from "./pages/DoctorLogin";
import { DoctorDashboard } from "./pages/DoctorDashboard";
import { DoctorVerificationQueue } from "./pages/DoctorVerificationQueue";
import { UnifiedTimeline } from "./pages/UnifiedTimeline";
import {
  PulseLogoIcon,
  StethoscopeIcon,
  ClipboardCheckIcon,
  ClockHistoryIcon,
  SunIcon,
  MoonIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogOutIcon,
  ActivityIcon,
} from "./components/Icons";

interface DoctorUser {
  name: string;
  email: string;
  specialty: string;
  hospital: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Clinical Workspace Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", maxWidth: "700px", margin: "40px auto", background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", boxShadow: "var(--shadow-md)" }}>
          <h2 style={{ color: "#f43f5e", fontSize: "18px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚠️</span> Clinical Workspace Recovery
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.5", marginBottom: "16px" }}>
            The clinical interface encountered an unexpected state. Patient safety guardrails preserved session state.
          </p>
          <pre style={{ background: "var(--bg-surface-elevated)", padding: "12px", borderRadius: "6px", fontSize: "11px", color: "var(--text-muted)", overflowX: "auto", marginBottom: "16px", border: "1px solid var(--border-subtle)" }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{ padding: "8px 18px", background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer", fontSize: "12px" }}
          >
            Reload Clinical Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppSidebar({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const location = useLocation();

  interface NavItem {
    path: string;
    alias?: string[];
    num: string;
    icon: ReactNode;
    title: string;
    sub: string;
    badge?: string;
  }

  const navItems: NavItem[] = [
    {
      path: "/",
      alias: ["/twin", "/dashboard"],
      num: "01",
      icon: <StethoscopeIcon size={18} />,
      title: "Doctor Portal",
      sub: "Patient Tracker & Glycemic Twin",
    },
    {
      path: "/review",
      num: "02",
      icon: <ClipboardCheckIcon size={18} />,
      title: "Verification Queue",
      sub: "Lab & Sensor Cross-Validation",
      badge: "3 Alerts",
    },
    {
      path: "/timeline",
      num: "03",
      icon: <ClockHistoryIcon size={18} />,
      title: "Unified Timeline",
      sub: "Longitudinal EHR Clinical Feed",
    },
  ];

  return (
    <aside className={`app-sidebar ${isOpen ? "expanded" : "collapsed"}`}>
      <div className="sidebar-inner">
        <div className="sidebar-nav-list">
          <div className="sidebar-section-label">
            {isOpen ? "Clinical Navigation" : "•••"}
          </div>
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.alias && item.alias.includes(location.pathname));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                title={!isOpen ? `${item.num} // ${item.title} — ${item.sub}` : undefined}
              >
                <div className="sidebar-item-icon">{item.icon}</div>
                {isOpen && (
                  <div className="sidebar-item-info">
                    <div className="sidebar-item-top">
                      <span className="sidebar-item-num">{item.num}</span>
                      <span className="sidebar-item-title">{item.title}</span>
                      {item.badge && <span className="sidebar-badge">{item.badge}</span>}
                    </div>
                    <div className="sidebar-item-sub">{item.sub}</div>
                  </div>
                )}
                {isActive && <div className="sidebar-active-indicator" />}
              </Link>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          {isOpen ? (
            <div className="sidebar-status-card">
              <div className="sidebar-status-title">
                <span className="live-pulse-dot"></span>
                <span>FastAPI Twin Engine</span>
              </div>
              <div className="sidebar-status-sub">Port 8000 • Calibrated XGBoost</div>
            </div>
          ) : (
            <div className="sidebar-collapsed-dot" title="FastAPI Twin Engine (8000 Active)">
              <span className="live-pulse-dot"></span>
            </div>
          )}

          <button
            className="sidebar-collapse-btn"
            onClick={onToggle}
            title={isOpen ? "Collapse Navigation Sidebar (Ctrl+B)" : "Expand Navigation Sidebar (Ctrl+B)"}
            aria-label={isOpen ? "Collapse Navigation Sidebar" : "Expand Navigation Sidebar"}
          >
            <span className="sidebar-toggle-arrow">
              {isOpen ? <ChevronLeftIcon size={15} /> : <ChevronRightIcon size={15} />}
            </span>
            {isOpen && <span className="sidebar-toggle-label">Collapse Menu</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ehr-theme") as "light" | "dark") || "dark";
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<string>("");

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

  // Live Hospital Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      {/* Enterprise Top Navigation Bar */}
      <header className="top-nav">
        <div className="brand-section">
          <button
            className="header-hamburger-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse navigation sidebar (Ctrl+B)" : "Expand navigation sidebar (Ctrl+B)"}
          >
            <ActivityIcon size={16} />
          </button>
          
          <div className="brand-logo-container">
            <PulseLogoIcon size={30} />
          </div>

          <div className="brand-meta-column">
            <div className="brand-title-row">
              <span className="brand-title">EHR // CLINICAL INTELLIGENCE</span>
              <span className="brand-version-badge">v2.4 Enterprise</span>
            </div>
            <div className="brand-subtitle">
              {doctor
                ? `${doctor.hospital} · ${doctor.specialty}`
                : "Type 2 Diabetes Metabolic Digital Twin Platform"}
            </div>
          </div>
        </div>

        <div className="system-status-pills">
          {/* Live Hospital Time */}
          <div className="status-indicator live-clock" title="Hospital Local Time (24h)">
            <span className="clock-pulse-dot"></span>
            <span className="clock-digits">{currentTime || "12:00:00"} IST</span>
          </div>

          {/* Microservice Live Status */}
          <div className="status-indicator engine-status" title="FastAPI Metabolic Digital Twin Engine on Port 8000">
            <span className="live-pulse-dot"></span>
            <span>Twin ML: 8000 (Active)</span>
          </div>

          {/* Cohort Population Pill */}
          <div className="status-indicator cohort-status" title="Active Monitored Shanghai Cohort">
            <span className="cohort-icon-dot"></span>
            <span>Shanghai Cohort: 100 Pts</span>
          </div>

          {/* Logged-in Physician Profile */}
          {doctor && (
            <div className="doctor-profile-badge" title={`Signed in as ${doctor.name} (${doctor.specialty})`}>
              <div className="doctor-avatar-circle">
                {doctor.name.split(" ").filter(n => !n.startsWith("Dr.")).map(n => n[0]).join("") || "MD"}
              </div>
              <div className="doctor-info-text">
                <span className="doctor-name">{doctor.name}</span>
                <span className="doctor-role">Attending Physician</span>
              </div>
              <button
                onClick={handleLogout}
                className="doctor-signout-btn"
                title="Secure Sign Out"
              >
                <LogOutIcon size={14} />
              </button>
            </div>
          )}

          {/* Theme Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            title={`Switch to ${theme === "light" ? "Dark Mode" : "Bright Mode"}`}
          >
            {theme === "light" ? <MoonIcon size={15} /> : <SunIcon size={15} />}
            <span className="theme-toggle-label">{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </header>

      {/* Render Login Screen if not signed in */}
      {!doctor ? (
        <main style={{ flex: 1, background: "var(--bg-main)" }}>
          <DoctorLogin onLogin={handleLogin} />
        </main>
      ) : (
        <div className="app-main-layout">
          <AppSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
          <div className="app-workspace-viewport">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<DoctorDashboard />} />
                <Route path="/twin" element={<DoctorDashboard />} />
                <Route path="/dashboard" element={<DoctorDashboard />} />
                <Route path="/review" element={<DoctorVerificationQueue />} />
                <Route path="/timeline" element={<UnifiedTimeline />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}
