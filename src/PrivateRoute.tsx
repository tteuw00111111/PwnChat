import { Navigate, Outlet } from "react-router-dom";
import { ACCESS_TOKEN_KEY } from "./utils/api";

export default function PrivateRoute() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
