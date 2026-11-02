"use client";

import { useEffect, useState } from "react";
import { ErrorNote, Icon, IconField, Logo, type IconName } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const highlights: { icon: IconName; title: string; text: string }[] = [
  { icon: "total", title: "Daily sales at a glance", text: "Know what you sold and what you received." },
  { icon: "clients", title: "A ledger for every client", text: "Track every service, credit and repayment." },
  { icon: "phone", title: "Works on your phone", text: "Sell from the counter or anywhere else." },
];

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
    <div className="hero flex flex-1 items-center justify-center !rounded-none p-4 sm:p-8">
      <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2">
        <div className="rise hidden lg:block">
          <Logo size={52} />
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight">
            Every sale.
            <br />
            Every balance.
            <br />
            <span className="text-mint">Every day.</span>
          </h1>
          <ul className="mt-8 space-y-5">
            {highlights.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-mint">
                  <Icon name={item.icon} />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-sm text-white/70">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rise mx-auto w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl sm:p-8" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-3">
            <span className="lg:hidden"><Logo size={42} /></span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Liz Cyber Tech</h2>
              <p className="text-sm text-muted">Log in to continue.</p>
            </div>
          </div>

          {!databaseReady && (
            <p className="mt-4 rounded-lg bg-credit-soft p-3 text-sm text-credit-dark" role="alert">
              The database is not set up yet. Run <code>supabase/schema.sql</code> in the Supabase SQL
              Editor, then reload this page.
            </p>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <IconField
                icon="mail"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <IconField
                icon="lock"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <button className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Please wait…" : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
