"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LoginForm } from "@/components/login-form";
import { Avatar, Icon, Logo, type IconName } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const links: { href: string; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { href: "/", label: "Sell", icon: "sell" },
  { href: "/sales", label: "Sales", icon: "sales" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/expenses", label: "Expenses", icon: "expenses" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/admin", label: "Admin", icon: "admin", adminOnly: true },
];

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-center text-muted">{children}</div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, session, profile, profileLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!ready || profileLoading) {
    return (
      <CenteredMessage>
        <div className="flex flex-col items-center gap-3">
          <Logo size={44} />
          <span>Loading…</span>
        </div>
      </CenteredMessage>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  // The next person to log in should start at the home screen, not on this user's page.
  async function logOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (!profile) {
    return (
      <CenteredMessage>
        <div>
          <p className="mb-4">This account has no profile yet. Ask an admin to add you.</p>
          <button className="btn btn-quiet" onClick={logOut}>
            Log out
          </button>
        </div>
      </CenteredMessage>
    );
  }

  const visible = links.filter((link) => !link.adminOnly || profile.role === "admin");
  const accountLabel = `${profile.username}${profile.role === "admin" ? " · admin" : ""}`;

  return (
    <div className="flex flex-1 flex-col">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-navy text-white lg:flex">
        <Link href="/" className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">Liz Cyber Tech</span>
            <span className="block text-xs text-white/60">Point of sale</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2" aria-label="Main">
          {visible.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  active ? "bg-white/12 text-white shadow-[inset_3px_0_0_var(--color-mint)]" : "text-white/70 hover:bg-white/6 hover:text-white"
                }`}
              >
                <Icon name={link.icon} />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link href="/account" className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/6">
            <Avatar name={profile.username} size={34} />
            <span className="min-w-0 truncate text-sm">{accountLabel}</span>
          </Link>
          <button
            className="mt-1 flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/70 hover:bg-white/6 hover:text-white"
            onClick={logOut}
          >
            <Icon name="logout" size={18} />
            Log out
          </button>
        </div>
      </aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-20 bg-navy text-white lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[15px] font-bold tracking-tight">
            <Logo size={30} />
            Liz Cyber Tech
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <Link href="/account" className="truncate rounded-lg px-2 py-2 text-sm text-white/80">
              {accountLabel}
            </Link>
            <button
              aria-label="Log out"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
              onClick={logOut}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full flex-1 pb-28 lg:pb-10 lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8 lg:pt-7">{children}</div>
      </main>

      {/* Phone and tablet bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
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
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-brand-soft" : ""}`}>
                <Icon name={link.icon} size={20} />
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
