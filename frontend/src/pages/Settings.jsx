import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState("daily");
  const [dataSharing, setDataSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    client
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data);
        setNotificationsEnabled(data.notificationsEnabled !== false);
        setEmailFrequency(data.emailFrequency || "daily");
        setDataSharing(data.dataSharing === true);
      })
      .catch(() => navigate("/login"));
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await client.patch("/auth/me", {
        notificationsEnabled,
        emailFrequency,
        dataSharing,
      });
      setMessage("✓ Settings saved");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <p className="text-ink-400">Loading…</p>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-ink-900 mb-8">Settings</h1>

      {message && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {/* Profile Section */}
      <section className="mb-8 rounded-2xl border border-ink-100 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-900">Email</label>
            <p className="mt-1 rounded-lg bg-ink-50 p-3 text-ink-600">{user.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-900">Name</label>
            <input
              type="text"
              defaultValue={user.name || ""}
              disabled
              className="mt-1 w-full rounded-lg border border-ink-100 bg-ink-50 p-3 text-ink-600"
            />
          </div>
          <p className="text-xs text-ink-400">Contact support to change your name or email.</p>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="mb-8 rounded-2xl border border-ink-100 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-900">Notifications enabled</p>
              <p className="text-sm text-ink-600">Email reminders for due reviews and streaks</p>
            </div>
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`h-6 w-11 rounded-full transition ${
                notificationsEnabled ? "bg-green-500" : "bg-ink-300"
              }`}
            />
          </div>

          {notificationsEnabled && (
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-2">Email frequency</label>
              <select
                value={emailFrequency}
                onChange={(e) => setEmailFrequency(e.target.value)}
                className="w-full rounded-lg border border-ink-100 p-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="never">Never</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Privacy Section */}
      <section className="mb-8 rounded-2xl border border-ink-100 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Privacy</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-900">Share learning data</p>
              <p className="text-sm text-ink-600">Help us improve by sharing anonymized study patterns</p>
            </div>
            <button
              onClick={() => setDataSharing(!dataSharing)}
              className={`h-6 w-11 rounded-full transition ${
                dataSharing ? "bg-green-500" : "bg-ink-300"
              }`}
            />
          </div>

          <div className="border-t border-ink-100 pt-4 mt-4">
            <p className="text-xs text-ink-600 mb-3">
              Your data is encrypted and will never be sold. See our{" "}
              <a href="/privacy" className="text-highlight hover:underline">
                privacy policy
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-6">
        <h2 className="font-display text-lg font-semibold text-red-900 mb-4">Danger zone</h2>
        <p className="text-sm text-red-800 mb-4">
          Deleting your account is permanent. All your study data will be lost.
        </p>
        <button
          onClick={() => {
            if (window.confirm("Are you absolutely sure? This cannot be undone.")) {
              client
                .delete("/auth/me")
                .then(() => {
                  logout();
                  navigate("/");
                })
                .catch(() => alert("Failed to delete account"));
            }
          }}
          className="rounded-full border-2 border-red-600 px-4 py-2 text-red-600 hover:bg-red-100"
        >
          Delete account
        </button>
      </section>

      {/* Save Button */}
      <div className="mt-8 flex gap-2">
        <button
          onClick={() => navigate("/")}
          className="flex-1 rounded-full border border-ink-900 py-3 text-ink-900"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-full bg-ink-900 py-3 text-paper disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </main>
  );
}
