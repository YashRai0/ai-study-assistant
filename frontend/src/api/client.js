import axios from "axios";

export const TOKEN_KEY = "ai_study_assistant_token";
export const REFRESH_TOKEN_KEY = "ai_study_assistant_refresh_token";

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
// access token), try once to silently refresh it using the stored refresh
// token before giving up. Only refresh tokens are long-lived (30 days);
// access tokens expire in 15 minutes, so without this every user would get
// bounced to /login every 15 minutes with no warning.
let isRefreshing = false;
let refreshWaiters = [];

function onRefreshed(newToken) {
  refreshWaiters.forEach((cb) => cb(newToken));
  refreshWaiters = [];
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      // Not a 401, or we already tried refreshing once for this request —
      // give up the same way as before.
      if (error.response?.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      // Another request already triggered a refresh; wait for it instead
      // of firing a second /auth/refresh call at the same time.
      return new Promise((resolve, reject) => {
        refreshWaiters.push((newToken) => {
          if (!newToken) return reject(error);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(client(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      if (data.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      isRefreshing = false;
      onRefreshed(data.accessToken);
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return client(originalRequest);
    } catch (refreshErr) {
      isRefreshing = false;
      onRefreshed(null);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshErr);
    }
  }
);

export function formatApiError(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (err.code === "ERR_NETWORK" || (typeof window !== "undefined" && !window.navigator.onLine)) {
    return "You appear to be offline or unable to reach the server. Please check your internet connection.";
  }
  if (err.response?.status === 429) {
    return "Too many requests. Please wait a moment before trying again.";
  }
  if (err.response?.status === 409) {
    return err.response?.data?.error || "This document is still being processed. You can leave this page—we'll keep working on it.";
  }
  if (err.response?.status >= 500) {
    return "The server encountered a temporary issue. Your progress and notes are safe. Please try again in a moment.";
  }
  return err.response?.data?.error || err.message || fallback;
}

export default client;