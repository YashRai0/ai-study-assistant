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

export default client;
