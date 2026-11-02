"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const [databaseReady, setDatabaseReady] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.rpc("has_users").then(({ error: rpcError }) => {
      if (active && rpcError) setDatabaseReady(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Wrong email or password."
          : signInError.message,
      );
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Liz Cyber Tech</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Log in to continue.</p>

        {!databaseReady && (
          <p className="mb-4 rounded-lg bg-credit-soft p-3 text-sm text-credit-dark" role="alert">
            The database is not set up yet. Run <code>supabase/schema.sql</code> in the Supabase SQL
            Editor, then reload this page.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
