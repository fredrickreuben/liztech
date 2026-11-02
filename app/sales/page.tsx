"use client";

import { useEffect, useState } from "react";
import { EmptyNote, ErrorNote, PageTitle, RangePicker, Stat, StatusBadge } from "@/components/ui";
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
      <PageTitle>Sales</PageTitle>

      <div className="space-y-3">
        <RangePicker value={range} onChange={resetting(setRange)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <input
            aria-label="Search by customer name or phone"
            className="field col-span-2 md:col-span-1"
            placeholder="Customer name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <select aria-label="Staff" className="field col-span-2 md:col-span-1" value={staffId} onChange={(e) => resetting(setStaffId)(e.target.value)}>
            <option value="">All staff</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>{person.username}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Sales" value={result ? String(result.count) : "–"} />
        <Stat label="Total" value={result ? money(result.total) : "–"} />
        <Stat label="Paid" value={result ? money(result.paid) : "–"} tone="brand" />
        <Stat label="Still owed" value={result ? money(result.balance) : "–"} tone="credit" />
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-4">
        {loading && <p className="text-sm text-muted">Loading sales…</p>}
        {!loading && !error && rows.length === 0 && <EmptyNote>No sales match these filters.</EmptyNote>}
        {rows.length > 0 && (
          <ul className="card divide-y divide-line">
            {rows.map((sale) => (
              <li key={sale.id} className="p-3 sm:px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{sale.customer_name}</span>
                      <StatusBadge status={sale.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {sale.items.map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name)).join(", ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {dateTime(sale.created_at)}
                      {sale.customer_phone ? ` · ${sale.customer_phone}` : ""}
                      {sale.staff ? ` · by ${sale.staff}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="money font-bold">{money(sale.total)}</div>
                    {sale.balance > 0 && (
                      <div className="money text-xs font-semibold text-credit">owes {money(sale.balance)}</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
