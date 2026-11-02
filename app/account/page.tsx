"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorNote, PageTitle } from "@/components/ui";
import { createSignupClient, supabase } from "@/lib/supabase";

function Saved({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-brand-soft p-3 text-sm text-brand-dark" role="status">
      {children}
    </p>
  );
}

export default function AccountPage() {
  const { profile, refreshProfile } = useAuth();

  const [username, setUsername] = useState(profile?.username ?? "");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function saveUsername(event: React.FormEvent) {
    event.preventDefault();
    setUsernameBusy(true);
    setUsernameError("");
    setUsernameSaved(false);
    const { error } = await supabase.rpc("update_my_username", { p_username: username });
    setUsernameBusy(false);
    if (error) return setUsernameError(error.message);
    setUsernameSaved(true);
    refreshProfile();
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      return setPasswordError("The new passwords do not match.");
    }

    setPasswordBusy(true);
    // Checked on a throwaway client so a wrong password cannot affect this session.
    const { error: checkError } = await createSignupClient().auth.signInWithPassword({
      email: profile?.email ?? "",
      password: currentPassword,
    });
    if (checkError) {
      setPasswordBusy(false);
      return setPasswordError("Your current password is wrong.");
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) return setPasswordError(error.message);

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
  }

  return (
    <div>
      <PageTitle>Account</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <form onSubmit={saveUsername} className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Username</h2>
          <p className="text-sm text-muted">Logged in as {profile?.email}</p>
          <div>
            <label className="label" htmlFor="account-username">Username</label>
            <input
              id="account-username"
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          {usernameError && <ErrorNote>{usernameError}</ErrorNote>}
          {usernameSaved && <Saved>Username updated.</Saved>}
          <button className="btn btn-primary w-full" disabled={usernameBusy}>
            {usernameBusy ? "Saving…" : "Save username"}
          </button>
        </form>

        <form onSubmit={savePassword} className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Password</h2>
          <div>
            <label className="label" htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              className="field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              className="field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Repeat new password</label>
            <input
              id="confirm-password"
              type="password"
              className="field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {passwordError && <ErrorNote>{passwordError}</ErrorNote>}
          {passwordSaved && <Saved>Password updated.</Saved>}
          <button className="btn btn-primary w-full" disabled={passwordBusy}>
            {passwordBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
