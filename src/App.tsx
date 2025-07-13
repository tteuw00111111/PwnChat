// src/App.tsx

import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Login } from "./pages/Login";
import Register from "./pages/Register";
import ChatPage from "./pages/ChatPage";
import "./index.css";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* --- TEMPORARY CHANGE --- */}
          {/* Make ChatPage the default route to work on it */}
          <Route path="/" element={<ChatPage />} />

          {/* --- ORIGINAL ROUTES (Comment these out for now) ---
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
