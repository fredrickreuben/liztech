"use client";

import { useEffect, useState } from "react";
import { Avatar, EmptyNote, ErrorNote, Icon, IconField, PageTitle, RangePicker, Stat, StatusBadge } from "@/components/ui";
import { dateTime, money, rangeBounds, type DateRange } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Profile, SaleRow, SalesSearchResult, Service } from "@/lib/types";

const PAGE_SIZE = 50;

export default function SalesPage() {
  const [range, setRange] = useState<DateRange>({ preset: "today", from: "", to: "" });
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const [result, setResult] = useState<SalesSearchResult | null>(null);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Pick<Profile, "id" | "username">[]>([]);
  const [services, setServices] = useState<Pick<Service, "id" | "name">[]>([]);

  useEffect(() => {
    supabase.from("profiles").select("id, username").order("username").then(({ data }) => setStaff(data ?? []));
    supabase.from("services").select("id, name").order("name").then(({ data }) => setServices(data ?? []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const incompleteCustom = range.preset === "custom" && (!range.from || !range.to);

  useEffect(() => {
    if (incompleteCustom) return;
    let active = true;
    const { from, to } = rangeBounds(range);
    supabase
      .rpc("search_sales", {
        p_from: from,
        p_to: to,
        p_status: status || null,
        p_staff: staffId || null,
        p_service: serviceId || null,
        p_query: debouncedSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        setLoading(false);
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setError("");
        const next = data as SalesSearchResult;
        setResult(next);
        setRows((current) => (page === 0 ? next.rows : [...current, ...next.rows]));
      });
    return () => {
      active = false;
    };
  }, [range, status, staffId, serviceId, debouncedSearch, page, incompleteCustom]);

  function resetting<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  const hasMore = result ? rows.length < result.count : false;

  return (
    <div>
      <PageTitle subtitle="Every sale, with the filters to find it.">Sales</PageTitle>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat label="Number of sales" value={result ? String(result.count) : "–"} icon="sales" />
        <Stat label="Total sold" value={result ? money(result.total) : "–"} icon="total" />
        <Stat label="Paid" value={result ? money(result.paid) : "–"} icon="wallet" tone="brand" />
        <Stat label="Still owed" value={result ? money(result.balance) : "–"} icon="clock" tone="credit" />
      </div>

      <div className="card mt-4 space-y-3 p-3 sm:p-4">
        <RangePicker value={range} onChange={resetting(setRange)} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <IconField
              icon="search"
              aria-label="Search by customer name or phone"
              placeholder="Customer name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select aria-label="Status" className="field" value={status} onChange={(e) => resetting(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Part paid</option>
            <option value="credit">Credit</option>
          </select>
          <select aria-label="Service" className="field" value={serviceId} onChange={(e) => resetting(setServiceId)(e.target.value)}>
            <option value="">All services</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
          <select aria-label="Staff" className="field col-span-2 lg:col-span-1" value={staffId} onChange={(e) => resetting(setStaffId)(e.target.value)}>
            <option value="">All staff</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>{person.username}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4">
        {loading && <p className="text-sm text-muted">Loading sales…</p>}
        {!loading && !error && rows.length === 0 && <EmptyNote>No sales match these filters.</EmptyNote>}
        {rows.length > 0 && (
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_110px_100px_110px_110px_24px] gap-3 border-b border-line bg-paper/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
              <span>Customer</span>
              <span>Services</span>
              <span>Staff</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span className="text-right">Owed</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {rows.map((sale) => (
                <SaleListRow
                  key={sale.id}
                  sale={sale}
                  open={openId === sale.id}
                  onToggle={() => setOpenId(openId === sale.id ? null : sale.id)}
                />
              ))}
            </ul>
          </div>
        )}
        {hasMore && (
          <button className="btn btn-quiet mt-3 w-full" onClick={() => setPage((p) => p + 1)}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

function itemSummary(sale: SaleRow) {
  return sale.items.map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name)).join(", ");
}

function SaleListRow({ sale, open, onToggle }: { sale: SaleRow; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="block w-full cursor-pointer p-3 text-left transition-colors hover:bg-paper/60 lg:px-4"
      >
        {/* Phone and tablet */}
        <div className="flex items-start gap-3 lg:hidden">
          <Avatar name={sale.customer_name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{sale.customer_name}</span>
              <StatusBadge status={sale.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted">{itemSummary(sale)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {dateTime(sale.created_at)}
              {sale.staff ? ` · by ${sale.staff}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="money font-bold">{money(sale.total)}</div>
            {sale.balance > 0 && <div className="money text-xs font-semibold text-credit">owes {money(sale.balance)}</div>}
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_110px_100px_110px_110px_24px] items-center gap-3 text-sm lg:grid">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={sale.customer_name} size={34} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{sale.customer_name}</div>
              <div className="truncate text-xs text-muted">{dateTime(sale.created_at)}</div>
            </div>
          </div>
          <div className="truncate text-muted">{itemSummary(sale)}</div>
          <div className="truncate text-muted">{sale.staff ?? "–"}</div>
          <div><StatusBadge status={sale.status} /></div>
          <div className="money text-right font-bold">{money(sale.total)}</div>
          <div className={`money text-right font-semibold ${sale.balance > 0 ? "text-credit" : "text-muted"}`}>
            {sale.balance > 0 ? money(sale.balance) : "–"}
          </div>
          <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span>
        </div>
      </button>
      {open && <SaleDetail sale={sale} />}
    </li>
  );
}

function SaleDetail({ sale }: { sale: SaleRow }) {
  const [payments, setPayments] = useState<{ id: string; amount: number; created_at: string }[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("payments")
      .select("id, amount, created_at")
      .eq("sale_id", sale.id)
      .order("created_at")
      .then(({ data }) => {
        if (active) setPayments(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [sale.id]);

  return (
    <div className="rise grid gap-4 border-t border-line bg-paper/60 p-4 text-sm sm:grid-cols-2">
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Services</h3>
        <ul className="space-y-1">
          {sale.items.map((item) => (
            <li key={item.name} className="flex items-baseline">
              <span className="truncate">{item.name}</span>
              <span className="money ml-1.5 shrink-0 text-xs text-muted">{item.quantity} @ {money(item.unit_price)}</span>
              <span className="leader" />
              <span className="money shrink-0 font-semibold">{money(item.line_total)}</span>
            </li>
          ))}
        </ul>
        {sale.customer_phone && <p className="mt-2 text-xs text-muted">Phone: {sale.customer_phone}</p>}
      </div>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Payments</h3>
        {payments === null && <p className="text-muted">Loading…</p>}
        {payments?.length === 0 && <p className="text-muted">Nothing paid yet.</p>}
        <ul className="space-y-1">
          {payments?.map((payment) => (
            <li key={payment.id} className="flex items-baseline">
              <span className="text-muted">{dateTime(payment.created_at)}</span>
              <span className="leader" />
              <span className="money shrink-0 font-semibold text-brand">{money(payment.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
