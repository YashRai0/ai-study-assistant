import { createContext, useContext, useEffect, useState } from "react";
import client, { TOKEN_KEY } from "./client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [email, setEmail] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    client
      .get("/auth/me")
      .then(({ data }) => setEmail(data.email))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  async function login(loginEmail, password) {
    const { data } = await client.post("/auth/login", { email: loginEmail, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setEmail(data.email);
  }

  async function register(regEmail, password) {
    const { data } = await client.post("/auth/register", { email: regEmail, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setEmail(data.email);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setEmail(null);
  }

  return (
    <AuthContext.Provider value={{ email, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
