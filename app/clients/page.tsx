"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Avatar, EmptyNote, ErrorNote, Icon, IconField, PageTitle, Stat } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { cleanSearch, supabase } from "@/lib/supabase";
import type { ClientBalance } from "@/lib/types";

type LedgerSale = {
  id: string;
  total: number;
  created_at: string;
  sale_items: { name: string; quantity: number }[];
};
type LedgerPayment = { id: string; amount: number; created_at: string };
type LedgerEntry = {
  id: string;
  at: string;
  title: string;
  charge: number;
  payment: number;
  balance: number;
};

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [owingOnly, setOwingOnly] = useState(true);
  const [clients, setClients] = useState<ClientBalance[] | null>(null);
  const [totals, setTotals] = useState<{ owed: number; owing: number; oldestDays: number | null } | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const query = cleanSearch(search);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      let request = supabase.from("client_balances").select("*");
      if (owingOnly) request = request.gt("balance", 0);
      if (query) request = request.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      request
        .order("balance", { ascending: false })
        .order("name")
        .limit(200)
        .then(({ data, error: loadError }) => {
          if (!active) return;
          if (loadError) setError(loadError.message);
          else {
            setError("");
            setClients(data as ClientBalance[]);
          }
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, owingOnly, version]);

  useEffect(() => {
    let active = true;
    const now = new Date();
    Promise.all([
      supabase.rpc("analytics", { p_from: now.toISOString(), p_to: now.toISOString(), p_tz: "UTC" }),
      supabase.from("client_balances").select("id", { count: "exact", head: true }).gt("balance", 0),
      supabase.from("sales").select("created_at").gt("balance", 0).order("created_at").limit(1),
    ]).then(([summary, owing, oldest]) => {
      if (!active) return;
      const oldestAt = oldest.data?.[0]?.created_at;
      setTotals({
        owed: summary.data?.outstanding ?? 0,
        owing: owing.count ?? 0,
        oldestDays: oldestAt ? Math.floor((now.getTime() - new Date(oldestAt).getTime()) / 86400000) : null,
      });
    });
    return () => {
      active = false;
    };
  }, [version]);

  const selected = clients?.find((client) => client.id === selectedId) ?? null;

  return (
    <div>
      <PageTitle subtitle="Who owes what, and everything they have paid.">Clients</PageTitle>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        <Stat label="Total owed by clients" value={totals ? money(totals.owed) : "–"} icon="wallet" tone="credit" />
        <Stat label="Clients who owe" value={totals ? String(totals.owing) : "–"} icon="clients" />
        <div className="col-span-2 lg:col-span-1">
          <Stat
            label="Oldest unpaid credit"
            value={!totals ? "–" : totals.oldestDays === null ? "None" : totals.oldestDays === 0 ? "Today" : `${totals.oldestDays} ${totals.oldestDays === 1 ? "day" : "days"}`}
            icon="clock"
            tone={totals?.oldestDays != null && totals.oldestDays > 30 ? "danger" : "navy"}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-sm">
          <IconField
            icon="search"
            aria-label="Search by name or phone"
            placeholder="Search name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={owingOnly}
            onChange={(e) => setOwingOnly(e.target.checked)}
          />
          Only clients who owe
        </label>
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6">
        <div>
          {clients === null && !error && <p className="text-sm text-muted">Loading clients…</p>}
          {clients?.length === 0 && (
            <EmptyNote>
              {owingOnly && !query
                ? "No client owes anything right now."
                : "No clients found. Clients are added when a sale is saved with a name and phone."}
            </EmptyNote>
          )}
          {clients && clients.length > 0 && (
            <ul className="card divide-y divide-line overflow-hidden">
              {clients.map((client) => (
                <li key={client.id}>
                  <button
                    className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-paper ${selectedId === client.id ? "bg-navy-soft" : ""}`}
                    aria-expanded={selectedId === client.id}
                    onClick={() => setSelectedId(selectedId === client.id ? null : client.id)}
                  >
                    <Avatar name={client.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{client.name}</span>
                      <span className="block text-sm text-muted">{client.phone}</span>
                    </span>
                    <span className={`money shrink-0 font-bold ${client.balance > 0 ? "text-credit" : "text-brand"}`}>
                      {client.balance > 0 ? money(client.balance) : "Settled"}
                    </span>
                  </button>
                  {selected?.id === client.id && (
                    <div className="rise border-t border-line p-4 lg:hidden">
                      <Ledger client={selected} version={version} onPaid={() => setVersion((v) => v + 1)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hidden lg:block">
          {selected ? (
            <div className="card rise sticky top-7 p-5">
              <Ledger client={selected} version={version} onPaid={() => setVersion((v) => v + 1)} />
            </div>
          ) : (
            clients && clients.length > 0 && <EmptyNote>Select a client to see their ledger.</EmptyNote>
          )}
        </div>
      </div>
    </div>
  );
}

function Ledger({
  client,
  version,
  onPaid,
}: {
  client: ClientBalance;
  version: number;
  onPaid: () => void;
}) {
  const [sales, setSales] = useState<LedgerSale[] | null>(null);
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const payFieldId = useId();

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from("sales")
        .select("id, total, created_at, sale_items(name, quantity)")
        .eq("client_id", client.id),
      supabase.from("payments").select("id, amount, created_at").eq("client_id", client.id),
    ]).then(([salesResult, paymentsResult]) => {
      if (!active) return;
      const failure = salesResult.error ?? paymentsResult.error;
      if (failure) {
        setError(failure.message);
        return;
      }
      setSales(salesResult.data as LedgerSale[]);
      setPayments(paymentsResult.data as LedgerPayment[]);
    });
    return () => {
      active = false;
    };
  }, [client.id, version]);

  // Oldest first to build the running balance, then shown newest first.
  const entries = useMemo(() => {
    if (!sales) return [];
    const merged = [
      ...sales.map((sale) => ({
        id: `s-${sale.id}`,
        at: sale.created_at,
        title: sale.sale_items
          .map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name))
          .join(", "),
        charge: sale.total,
        payment: 0,
        order: 0,
      })),
      ...payments.map((payment) => ({
        id: `p-${payment.id}`,
        at: payment.created_at,
        title: "Payment",
        charge: 0,
        payment: payment.amount,
        order: 1,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

    let balance = 0;
    const withBalance: LedgerEntry[] = merged.map((entry) => {
      balance += entry.charge - entry.payment;
      return { ...entry, balance };
    });
    return withBalance.reverse();
  }, [sales, payments]);

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("record_client_payment", {
      p_client_id: client.id,
      p_amount: value,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setAmount("");
    onPaid();
  }

  const paidShare = client.billed > 0 ? Math.round((client.paid / client.billed) * 100) : 0;

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="hidden sm:inline-flex"><Avatar name={client.name} size={46} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{client.name}</h2>
          <a href={`tel:${client.phone}`} className="inline-flex min-h-7 items-center gap-1 text-sm font-medium text-brand">
            <Icon name="phone" size={14} />
            {client.phone}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted">Owes</div>
          <div className={`money text-2xl font-bold ${client.balance > 0 ? "text-credit" : "text-brand"}`}>
            {money(client.balance)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted">
          <span className="money">Paid {money(client.paid)} of {money(client.billed)}</span>
          <span className="money font-semibold">{paidShare}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${paidShare}%` }} />
        </div>
      </div>

      {client.balance > 0 && (
        <form onSubmit={pay} className="mt-4">
          <label className="label" htmlFor={payFieldId}>Record a payment</label>
          <div className="flex gap-2">
            <input
              id={payFieldId}
              className="field money min-w-0 flex-1"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              max={client.balance}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button type="button" className="btn btn-quiet shrink-0 !px-3" onClick={() => setAmount(String(client.balance))}>
              Full
            </button>
            <button className="btn btn-primary shrink-0" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <h3 className="mb-1 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name="ledger" size={15} />Ledger</h3>
      {sales === null && !error && <p className="text-sm text-muted">Loading…</p>}
      <ul className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2.5 py-2.5 text-sm">
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${entry.payment > 0 ? "bg-brand-soft text-brand-dark" : "bg-credit-soft text-credit-dark"}`}>
              <Icon name={entry.payment > 0 ? "wallet" : "sales"} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className={entry.payment > 0 ? "font-semibold text-brand" : "font-medium"}>{entry.title}</div>
              <div className="text-xs text-muted">{dateTime(entry.at)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`money font-semibold ${entry.payment > 0 ? "text-brand" : ""}`}>
                {entry.payment > 0 ? `− ${money(entry.payment)}` : `+ ${money(entry.charge)}`}
              </div>
              <div className="money text-xs text-muted">Balance {money(entry.balance)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
