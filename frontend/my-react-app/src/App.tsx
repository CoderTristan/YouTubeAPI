import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import "./App.css";

export default function App() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("yt_user_id");
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem("yt_authenticated") === "true";
    } catch {
      return false;
    }
  });

  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const auth = params.get("auth");
    const user = params.get("user");

    if (auth === "ok" && user) {
      setUserId(user);
      setIsAuthenticated(true);

      try {
        localStorage.setItem("yt_user_id", user);
        localStorage.setItem("yt_authenticated", "true");
      } catch (err) {
        console.error(err);
      }

      window.history.replaceState({}, "", "/");
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleLogin = async () => {
    try {
      setAuthLoading(true);

      const res = await fetch(
        "http://localhost:8000/auth/login?user_id=default"
      );

      if (!res.ok) {
        throw new Error(`Login failed (${res.status})`);
      }

      const data = await res.json();

      if (!data.auth_url) {
        throw new Error("Missing auth_url from backend");
      }

      window.location.href = data.auth_url;
    } catch (err) {
      console.error(err);
      alert("Unable to start Google authentication.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("yt_user_id");
      localStorage.removeItem("yt_authenticated");
    } catch {}

    setUserId(null);
    setIsAuthenticated(false);

    navigate("/");
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
            <div className="text-center p-10 bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
              <h1 className="text-3xl font-extrabold mb-4">
                YouTube Analytics
              </h1>

              <p className="text-gray-300 mb-6">
                Channel overview and per-video insights.
              </p>

              {!isAuthenticated ? (
                <button
                  onClick={handleLogin}
                  disabled={authLoading}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 transition rounded-lg text-lg font-semibold shadow-md disabled:opacity-50"
                >
                  {authLoading
                    ? "Connecting..."
                    : "Sign in with Google"}
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 transition rounded-lg text-lg font-semibold shadow-md"
                  >
                    Open Dashboard
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 transition rounded-lg text-lg font-semibold shadow-md"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />

      <Route
        path="/dashboard"
        element={
          isAuthenticated ? (
            <Dashboard userId={userId ?? "default"} />
          ) : (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
              Please sign in first.
            </div>
          )
        }
      />
    </Routes>
  );
}