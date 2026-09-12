"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import Dashboard from "./dashboard";
import type { AuthUser } from "@/lib/types";

export default function AppShell() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Login failed.");
      setUser(data.user);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setUsername("");
    setPassword("");
  }

  if (user === undefined) return <div className="auth-loading"><div className="spinner" /><p>Securing workspace…</p></div>;
  if (user) return <Dashboard user={user} onLogout={logout} />;

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span>TPA <b>Pulse</b></span></div>
        <div className="login-icon"><LockKeyhole size={24} /></div>
        <p className="eyebrow">Secure workspace</p>
        <h1>Welcome back</h1>
        <p className="login-copy">Sign in to view your TPA operations dashboard.</p>
        <form onSubmit={login}>
          <label className="name-field"><span>Username</span><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label className="name-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <div className="error-banner"><span>!</span>{error}</div>}
          <button className="button primary login-button" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
