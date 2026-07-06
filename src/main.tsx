import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./services/sentry";
import { initAnalytics } from "./services/analytics";
import { registerPersistenceFlush } from "./services/db";
import "./index.css";

initSentry();
initAnalytics();
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
