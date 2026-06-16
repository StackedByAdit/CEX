import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { ApiError, signup } from "../lib/api";

export default function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await signup(username, password);
      navigate("/login", { state: { username } });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Signup failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Start trading on ORBIT Exchange"
      footerText="Already have an account?"
      footerLink={{ to: "/login", label: "Sign in" }}
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
            placeholder="Min. 3 characters"
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
            placeholder="Min. 6 characters"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-orbit-secondary">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded bg-orbit-elevated px-4 py-3 text-sm outline-none ring-white/20 transition focus:ring-2"
            placeholder="Repeat password"
            required
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
    </AuthLayout>
  );
}
