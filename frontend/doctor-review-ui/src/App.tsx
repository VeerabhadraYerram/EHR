import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 20 }}>
        <h1>EHR Doctor Review UI (Skeleton)</h1>
        <nav>
          <a href="/" style={{ marginRight: 10 }}>Home</a>
          <a href="/review" style={{ marginRight: 10 }}>Review Tasks</a>
          <a href="/fhir" style={{ marginRight: 10 }}>FHIR Preview</a>
        </nav>
        <hr />
        <Routes>
          <Route path="/" element={<div>Welcome to the EHR Platform</div>} />
          <Route path="/review" element={<div>Pending verification tasks...</div>} />
          <Route path="/fhir" element={<div>FHIR resource preview...</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
