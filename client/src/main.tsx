import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { ThemeProvider } from "./contexts/theme-context";
import { initMonitoring } from "./lib/monitoring";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, initCSRFToken } from "./lib/queryClient";
import { GlobalQueryErrorHandler } from "./components/GlobalQueryErrorHandler";

// Global flags to prevent double inits (StrictMode/HMR)
declare global {
  interface Window {
    __SW_INIT__?: boolean;
    __MONITORING_INIT__?: boolean;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

const root = createRoot(rootEl);

// Kick off CSRF fetch early (non-blocking)
initCSRFToken().catch((err) => {
  console.error("CSRF init failed (non-fatal):", err);
});

// Render app (single QueryClientProvider lives HERE)
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* Single global React Query error handler */}
        <GlobalQueryErrorHandler />
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

// Kick off non-critical stuff after first render
if (typeof window !== "undefined") {
  // Monitoring: prod-only, single init even with HMR
  if (import.meta.env.PROD && !window.__MONITORING_INIT__) {
    window.__MONITORING_INIT__ = true;
    setTimeout(() => {
      try {
        initMonitoring();
      } catch (err) {
        console.error("Monitoring init failed", err);
      }
    }, 0);
  }

  // PWA service worker: feature-check + once-only guard
  if ("serviceWorker" in navigator && !window.__SW_INIT__) {
    window.__SW_INIT__ = true;

    const updateSW = registerSW({
      immediate: false,
      onNeedRefresh() {
        const doUpdate = () => updateSW(true);
        window.dispatchEvent(
          new CustomEvent("sw-update-available", {
            detail: { update: doUpdate },
          }),
        );
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent("sw-offline-ready"));
        console.log("App ready to work offline");
      },
    });
  }
}
