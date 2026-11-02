"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  profileLoading: boolean;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from("profiles")
      .select("id, email, username, role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setLoaded({ userId, profile: (data as Profile | null) ?? null });
      });
    return () => {
      active = false;
    };
  }, [userId, version]);

  const refreshProfile = useCallback(() => setVersion((v) => v + 1), []);

  const current = userId && loaded?.userId === userId ? loaded : null;

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        profile: current?.profile ?? null,
        profileLoading: Boolean(userId) && !current,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
