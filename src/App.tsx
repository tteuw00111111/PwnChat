import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChatPage from "./pages/ChatPage";
import PrivateRoute from "./PrivateRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected area */}
      <Route element={<PrivateRoute />}>
        <Route path="/chat" element={<ChatPage />} />
      </Route>
    </Routes>
  );
}
