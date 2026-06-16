import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { ApiError, login } from "../lib/api";
import { setAuth } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(username, password);
      setAuth(data.token, username);
      navigate("/trade");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to access your trading account"
      footerText="Don't have an account?"
      footerLink={{ to: "/signup", label: "Create account" }}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded border border-orbit-red/30 bg-orbit-red/10 px-4 py-3 text-sm text-orbit-red">
            {error}
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-orbit-secondary">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded bg-orbit-elevated px-4 py-3 text-sm outline-none ring-white/20 transition focus:ring-2"
            placeholder="Enter username"
            required
            minLength={3}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-orbit-secondary">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded bg-orbit-elevated px-4 py-3 text-sm outline-none ring-white/20 transition focus:ring-2"
            placeholder="Enter password"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p className="text-center text-xs text-orbit-muted">
          Demo accounts start with INR and stock balances pre-funded.
        </p>
      </form>
    </AuthLayout>
  );
}
