"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyNote, ErrorNote, PageTitle, Stat } from "@/components/ui";
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
  const [outstanding, setOutstanding] = useState<number | null>(null);
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
    const now = new Date().toISOString();
    supabase
      .rpc("analytics", { p_from: now, p_to: now, p_tz: "UTC" })
      .then(({ data }) => {
        if (active && data) setOutstanding(data.outstanding);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const selected = clients?.find((client) => client.id === selectedId) ?? null;

  return (
    <div>
      <PageTitle>Clients</PageTitle>

      <div className="grid grid-cols-1 gap-2 sm:max-w-xs">
        <Stat label="Total owed by clients" value={outstanding === null ? "–" : money(outstanding)} tone="credit" />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          aria-label="Search by name or phone"
          className="field sm:max-w-sm"
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-brand)]"
            checked={owingOnly}
            onChange={(e) => setOwingOnly(e.target.checked)}
          />
          Only clients who owe
        </label>
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6">
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
                    className={`flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-paper ${selectedId === client.id ? "bg-brand-soft" : ""}`}
                    aria-expanded={selectedId === client.id}
                    onClick={() => setSelectedId(selectedId === client.id ? null : client.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{client.name}</span>
                      <span className="block text-sm text-muted">{client.phone}</span>
                    </span>
                    <span className={`money shrink-0 font-bold ${client.balance > 0 ? "text-credit" : "text-muted"}`}>
                      {client.balance > 0 ? money(client.balance) : "Settled"}
                    </span>
                  </button>
                  {selected?.id === client.id && (
                    <div className="border-t border-line p-4 lg:hidden">
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
            <div className="card sticky top-20 p-4">
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

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{client.name}</h2>
          <a href={`tel:${client.phone}`} className="text-sm text-brand underline">
            {client.phone}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted">Owes</div>
          <div className={`money text-xl font-bold ${client.balance > 0 ? "text-credit" : "text-muted"}`}>
            {money(client.balance)}
          </div>
        </div>
      </div>

      {client.balance > 0 && (
        <form onSubmit={pay} className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor={`pay-${client.id}`}>Record a payment</label>
            <input
              id={`pay-${client.id}`}
              className="field money"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              max={client.balance}
              placeholder={String(client.balance)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <h3 className="mb-1 mt-4 text-sm font-semibold text-muted">Ledger</h3>
      {sales === null && !error && <p className="text-sm text-muted">Loading…</p>}
      <ul className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className={entry.payment > 0 ? "font-medium text-brand" : ""}>{entry.title}</div>
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
