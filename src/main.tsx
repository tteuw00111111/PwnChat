import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { GeistProvider, CssBaseline } from "@geist-ui/core";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* 2. Wrap your App component with the providers */}
    <GeistProvider themeType="dark">
      <CssBaseline />
      <App />
    </GeistProvider>
  </React.StrictMode>
);

window.electronAPI?.onMainProcessMessage((message) => {
  console.log("Message from main process:", message);
});
