import axios from "axios";

export const TOKEN_KEY = "ai_study_assistant_token";

// In local dev, Vite proxies "/api" to the backend (see vite.config.js).
// In production, set VITE_API_URL to your deployed backend's URL, e.g.
// https://your-app.up.railway.app/api/v1
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

const client = axios.create({ baseURL: API_BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the backend ever rejects a request as unauthorized (expired/invalid
// token, or the token was cleared some other way), stop the app in its
// tracks instead of letting protected pages hang on a request that will
// never succeed. This complements the one-time check in AuthContext's
// useEffect (which only runs on initial mount) by catching a 401 that
// happens *during* an active session — e.g. the token expires while the
// user is mid-way through using the app.
//
// This lives here (not in AuthContext) because any component using
// `client` benefits automatically, without each one needing its own
// try/catch for the 401 case.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Full reload (not a react-router navigate) so AuthProvider's mount
      // logic re-runs cleanly from a known-good state, and any in-flight
      // component state tied to the now-invalid session is discarded
      // rather than patched around. Guard against a redirect loop if the
      // 401 happens to originate from the login page itself.
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default client;