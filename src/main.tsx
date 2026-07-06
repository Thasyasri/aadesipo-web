import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./services/sentry";
import { initAnalytics } from "./services/analytics";
import { registerPersistenceFlush } from "./services/db";
import "./index.css";

// Both load their heavy SDK dynamically and only when configured, so these
// are fire-and-forget — the app renders immediately without waiting on them.
void initSentry();
void initAnalytics();
registerPersistenceFlush();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
