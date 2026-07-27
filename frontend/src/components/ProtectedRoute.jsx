import { Navigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { email, ready } = useAuth();

  if (!ready) return null; // avoid a login-page flash while we check the token
  if (!email) return <Navigate to="/login" replace />;

  return children;
}
