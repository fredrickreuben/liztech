"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LoginForm } from "@/components/login-form";
import { supabase } from "@/lib/supabase";

const iconPaths: Record<string, string> = {
  sell: "M4 7h16l-1.5 11a2 2 0 0 1-2 1.7h-9a2 2 0 0 1-2-1.7L4 7Zm4 0a4 4 0 0 1 8 0",
  sales: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-6",
  clients: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.8M15.5 4.7a3 3 0 0 1 0 5.6",
  analytics: "M3 17l5.5-5.5 4 4L21 7m0 0h-5m5 0v5",
  admin: "M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6L12 3Z",
};

const links = [
  { href: "/", label: "Sell", icon: "sell" },
  { href: "/sales", label: "Sales", icon: "sales" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/admin", label: "Admin", icon: "admin", adminOnly: true },
];

function Icon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-center text-muted">{children}</div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, session, profile, profileLoading } = useAuth();
  const pathname = usePathname();

  if (!ready || profileLoading) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }

  if (!session) {
    return <LoginForm />;
  }

  if (!profile) {
    return (
      <CenteredMessage>
        <div>
          <p className="mb-4">This account has no profile yet. Ask an admin to add you.</p>
          <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </div>
      </CenteredMessage>
    );
  }

  const visible = links.filter((link) => !link.adminOnly || profile.role === "admin");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="whitespace-nowrap text-[15px] font-bold tracking-tight">
            Liz Cyber Tech
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {visible.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-white/15" : "text-white/75 hover:text-white"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <Link href="/account" className="truncate text-sm text-white/75 underline-offset-2 hover:text-white hover:underline">
              {profile.username}
              {profile.role === "admin" ? " · admin" : ""}
            </Link>
            <button
              className="shrink-0 cursor-pointer rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium hover:bg-white/10"
              onClick={() => supabase.auth.signOut()}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 md:pb-10 md:pt-6">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        {visible.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
            >
              <Icon name={link.icon} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
