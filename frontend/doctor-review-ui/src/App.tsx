import { useEffect } from "react";
import DiagnosticWorkstation from "./diagnostics/DiagnosticWorkstation";

export default function App() {
  useEffect(() => {
    if (!["/", "/diagnostics"].includes(window.location.pathname)) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  return <DiagnosticWorkstation />;
}
