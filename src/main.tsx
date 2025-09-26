// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter as Router } from "react-router-dom"; // 👈 Import Router here
import App from "./App";
import "./index.css";
import { GeistProvider, CssBaseline } from "@geist-ui/core";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GeistProvider themeType="dark">
      <CssBaseline />
      {/* 👇 Wrap the App component with the single Router */}
      <Router>
        <App />
      </Router>
    </GeistProvider>
  </React.StrictMode>
);
