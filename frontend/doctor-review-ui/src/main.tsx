import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initializeAuthentication } from "./auth";

initializeAuthentication()
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((error) => {
    const root = document.getElementById("root")!;
    root.textContent = `Sign-in could not start: ${error.message}`;
  });
