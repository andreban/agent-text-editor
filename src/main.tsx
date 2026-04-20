// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppProvider } from "./lib/store";
import { ThemeProvider } from "./lib/ThemeProvider";
import { SupportingDocsProvider } from "./lib/SupportingDocsContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <SupportingDocsProvider>
          <App />
        </SupportingDocsProvider>
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
