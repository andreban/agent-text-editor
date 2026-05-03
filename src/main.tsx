// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@mast-ai/react-ui/styles.css";
import "./index.css";
import { AppProvider } from "./lib/store";
import { ThemeProvider } from "./lib/ThemeProvider";
import { WorkspacesProvider } from "./lib/WorkspacesContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <WorkspacesProvider>
          <App />
        </WorkspacesProvider>
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
