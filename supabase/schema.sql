-- Liz Cyber Tech POS: database schema.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: nothing here deletes existing data.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- Emails an admin has approved. Sign-ups for anything else are rejected, so the
-- public publishable key cannot be used to register an account.
create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  price numeric(12, 2) not null check (price >= 0),
  created_at timestamptz not null default now()
);

-- A client record exists only when both name and phone are known.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete restrict,
  customer_name text not null default 'Walk-in',
  customer_phone text,
  total numeric(12, 2) not null default 0 check (total >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  balance numeric(12, 2) generated always as (total - amount_paid) stored,
  status text generated always as (
    case
      when amount_paid >= total then 'paid'
      when amount_paid > 0 then 'partial'
      else 'credit'
    end
  ) stored,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount_paid <= total)
);

-- Name and price are copied at sale time, so editing or deleting a service
-- never changes past sales.
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored
);

-- Every amount received, dated when it was received. A credit sale paid off
-- next week counts as collected next week.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  client_id uuid references public.clients (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_created_at_idx on public.sales (created_at desc);
create index if not exists sales_client_idx on public.sales (client_id, created_at);
create index if not exists sales_open_idx on public.sales (client_id) where status <> 'paid';
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_service_idx on public.sale_items (service_id);
create index if not exists payments_created_at_idx on public.payments (created_at desc);
create index if not exists payments_sale_idx on public.payments (sale_id);
create index if not exists payments_client_idx on public.payments (client_id, created_at);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Lets the login screen offer "create the first admin" on a fresh install.
create or replace function public.has_users()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles);
$$;

-- ---------------------------------------------------------------------------
-- Sign-up gate: the first account must be the default admin, and every later
-- one must be approved by an admin.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('liztech_signup'));
  v_first := not exists (select 1 from public.profiles);

  if v_first and v_email <> 'admin@liztechcyber.com' then
    raise exception 'Sign-ups are closed.';
  end if;

  if not v_first and not exists (select 1 from public.allowed_emails where email = v_email) then
    raise exception 'Sign-ups are closed. Ask an admin to add you.';
  end if;

  insert into public.profiles (id, email, username, role)
  values (
    new.id,
    v_email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(v_email, '@', 1)),
    case when v_first then 'admin' else 'staff' end
  );

  delete from public.allowed_emails where email = v_email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------

create or replace function public.allow_email(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can add users.';
  end if;
  insert into public.allowed_emails (email)
  values (lower(trim(p_email)))
  on conflict (email) do nothing;
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'Unknown role.';
  end if;

  -- Serialises concurrent changes so two admins cannot demote each other.
  perform 1 from public.profiles where role = 'admin' for update;

  if p_role = 'staff'
    and exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
    and (select count(*) from public.profiles where role = 'admin') = 1 then
    raise exception 'There must be at least one admin.';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'User not found.';
  end if;
end;
$$;

-- Role must stay out of reach of a user editing their own row, so this is the
-- only way a profile is changed by its owner.
create or replace function public.update_my_username(p_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_username text := trim(coalesce(p_username, ''));
begin
  if v_username = '' then
    raise exception 'Enter a username.';
  end if;
  update public.profiles set username = v_username where id = auth.uid();
  if not found then
    raise exception 'Please log in again.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Selling
-- ---------------------------------------------------------------------------

-- Prices come from the services table, never from the browser.
-- p_items: [{"service_id": "...", "quantity": 2}, ...]
create or replace function public.create_sale(
  p_items jsonb,
  p_amount_paid numeric,
  p_customer_name text default null,
  p_phone text default null,
  p_client_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_total numeric(12, 2);
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_client_id uuid := p_client_id;
begin
  if not public.is_member() then
    raise exception 'Please log in again.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one service.';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 then
    raise exception 'Enter a valid amount paid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i (service_id uuid, quantity integer)
    left join public.services s on s.id = i.service_id
    where s.id is null or i.quantity is null or i.quantity <= 0
  ) then
    raise exception 'A selected service is no longer available. Refresh and try again.';
  end if;

  select coalesce(sum(s.price * i.quantity), 0) into v_total
  from jsonb_to_recordset(p_items) as i (service_id uuid, quantity integer)
  join public.services s on s.id = i.service_id;

  if p_amount_paid > v_total then
    raise exception 'Amount paid cannot be more than the total.';
  end if;

  if v_client_id is not null then
    select name, phone into v_name, v_phone from public.clients where id = v_client_id;
    if not found then
      raise exception 'Client not found.';
    end if;
  elsif v_name is not null and v_phone is not null then
    -- A known phone number links to the existing client and keeps their name.
    insert into public.clients (name, phone)
    values (v_name, v_phone)
    on conflict (phone) do update set phone = excluded.phone
    returning id, name into v_client_id, v_name;
  elsif p_amount_paid < v_total then
    raise exception 'Name and phone are required for credit.';
  end if;

  insert into public.sales (id, client_id, customer_name, customer_phone, total, amount_paid, created_by)
  values (v_sale_id, v_client_id, coalesce(v_name, 'Walk-in'), v_phone, v_total, p_amount_paid, auth.uid());

  insert into public.sale_items (sale_id, service_id, name, unit_price, quantity)
  select v_sale_id, s.id, s.name, s.price, i.quantity
  from jsonb_to_recordset(p_items) as i (service_id uuid, quantity integer)
  join public.services s on s.id = i.service_id;

  if p_amount_paid > 0 then
    insert into public.payments (sale_id, client_id, amount, created_by)
    values (v_sale_id, v_client_id, p_amount_paid, auth.uid());
  end if;

  return v_sale_id;
end;
$$;

-- Applies a payment to the client's oldest unpaid sales first.
-- Returns what the client still owes.
create or replace function public.record_client_payment(p_client_id uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_owed numeric(12, 2);
  v_left numeric(12, 2) := p_amount;
  v_apply numeric(12, 2);
  v_sale record;
begin
  if not public.is_member() then
    raise exception 'Please log in again.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  -- Locks the client first so two simultaneous payments cannot both pass the
  -- overpayment check below.
  perform 1 from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found.';
  end if;

  select coalesce(sum(balance), 0) into v_owed
  from public.sales where client_id = p_client_id;

  if p_amount > v_owed then
    raise exception 'Payment is more than the % owed.', v_owed;
  end if;

  for v_sale in
    select id, balance from public.sales
    where client_id = p_client_id and balance > 0
    order by created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_apply := least(v_left, v_sale.balance);
    update public.sales set amount_paid = amount_paid + v_apply where id = v_sale.id;
    insert into public.payments (sale_id, client_id, amount, created_by)
    values (v_sale.id, p_client_id, v_apply, auth.uid());
    v_left := v_left - v_apply;
  end loop;

  return v_owed - p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

create or replace view public.client_balances with (security_invoker = true) as
select
  c.id,
  c.name,
  c.phone,
  coalesce(s.billed, 0)::numeric(12, 2) as billed,
  coalesce(s.paid, 0)::numeric(12, 2) as paid,
  coalesce(s.balance, 0)::numeric(12, 2) as balance,
  s.last_sale_at
from public.clients c
left join lateral (
  select
    sum(total) as billed,
    sum(amount_paid) as paid,
    sum(balance) as balance,
    max(created_at) as last_sale_at
  from public.sales
  where client_id = c.id
) s on true;

-- One filtered page of sales plus totals across every matching sale.
create or replace function public.search_sales(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_status text default null,
  p_staff uuid default null,
  p_service uuid default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with matched as (
    select s.*
    from public.sales s
    where (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
      and (p_status is null or s.status = p_status)
      and (p_staff is null or s.created_by = p_staff)
      and (p_service is null or exists (
        select 1 from public.sale_items i where i.sale_id = s.id and i.service_id = p_service
      ))
      and (
        nullif(trim(coalesce(p_query, '')), '') is null
        or s.customer_name ilike '%' || trim(p_query) || '%'
        or s.customer_phone ilike '%' || trim(p_query) || '%'
      )
  ),
  page as (
    select * from matched order by created_at desc, id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'count', (select count(*) from matched),
    'total', (select coalesce(sum(total), 0) from matched),
    'paid', (select coalesce(sum(amount_paid), 0) from matched),
    'balance', (select coalesce(sum(balance), 0) from matched),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'client_id', p.client_id,
          'customer_name', p.customer_name,
          'customer_phone', p.customer_phone,
          'total', p.total,
          'amount_paid', p.amount_paid,
          'balance', p.balance,
          'status', p.status,
          'created_at', p.created_at,
          'staff', (select username from public.profiles where id = p.created_by),
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'name', i.name,
              'quantity', i.quantity,
              'unit_price', i.unit_price,
              'line_total', i.line_total
            ) order by i.name)
            from public.sale_items i where i.sale_id = p.id
          ), '[]'::jsonb)
        ) order by p.created_at desc, p.id
      )
      from page p
    ), '[]'::jsonb)
  );
$$;

-- Totals for a period. "sales_total" is what was sold in the period;
-- "collected" is the money received in it, including old credit paid back.
create or replace function public.analytics(p_from timestamptz, p_to timestamptz, p_tz text default 'UTC')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sales_total', (select coalesce(sum(total), 0) from public.sales where created_at >= p_from and created_at < p_to),
    'sale_count', (select count(*) from public.sales where created_at >= p_from and created_at < p_to),
    'collected', (select coalesce(sum(amount), 0) from public.payments where created_at >= p_from and created_at < p_to),
    'credit_given', (select coalesce(sum(balance), 0) from public.sales where created_at >= p_from and created_at < p_to),
    'outstanding', (select coalesce(sum(balance), 0) from public.sales),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'sales', (
          select coalesce(sum(total), 0) from public.sales
          where created_at >= p_from and created_at < p_to
            and (created_at at time zone p_tz)::date = d.day
        ),
        'collected', (
          select coalesce(sum(amount), 0) from public.payments
          where created_at >= p_from and created_at < p_to
            and (created_at at time zone p_tz)::date = d.day
        )
      ) order by d.day), '[]'::jsonb)
      from (
        select g::date as day
        from generate_series(
          (p_from at time zone p_tz)::date::timestamp,
          ((p_to - interval '1 millisecond') at time zone p_tz)::date::timestamp,
          interval '1 day'
        ) g
      ) d
    ),
    'top_services', (
      select coalesce(jsonb_agg(t order by t.revenue desc, t.name), '[]'::jsonb)
      from (
        select i.name, sum(i.quantity) as quantity, sum(i.line_total) as revenue
        from public.sale_items i
        join public.sales s on s.id = i.sale_id
        where s.created_at >= p_from and s.created_at < p_to
        group by i.name
        order by revenue desc, i.name
        limit 8
      ) t
    ),
    'by_staff', (
      select coalesce(jsonb_agg(t order by t.sales desc, t.username), '[]'::jsonb)
      from (
        select coalesce(p.username, 'Removed user') as username, sum(s.total) as sales, count(*) as sale_count
        from public.sales s
        left join public.profiles p on p.id = s.created_by
        where s.created_at >= p_from and s.created_at < p_to
        group by 1
      ) t
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security: writes to money tables go only through the functions
-- above, which run with elevated rights and do their own checks.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());

drop policy if exists "members read services" on public.services;
create policy "members read services" on public.services
  for select to authenticated using (public.is_member());

drop policy if exists "admins add services" on public.services;
create policy "admins add services" on public.services
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins edit services" on public.services;
create policy "admins edit services" on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins remove services" on public.services;
create policy "admins remove services" on public.services
  for delete to authenticated using (public.is_admin());

drop policy if exists "members read clients" on public.clients;
create policy "members read clients" on public.clients
  for select to authenticated using (public.is_member());

drop policy if exists "members read sales" on public.sales;
create policy "members read sales" on public.sales
  for select to authenticated using (public.is_member());

drop policy if exists "members read sale items" on public.sale_items;
create policy "members read sale items" on public.sale_items
  for select to authenticated using (public.is_member());

drop policy if exists "members read payments" on public.payments;
create policy "members read payments" on public.payments
  for select to authenticated using (public.is_member());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.clients, public.sales, public.sale_items,
  public.payments, public.client_balances to authenticated;
grant select, insert, update, delete on public.services to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_users() to anon, authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.allow_email(text) to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.update_my_username(text) to authenticated;
grant execute on function public.create_sale(jsonb, numeric, text, text, uuid) to authenticated;
grant execute on function public.record_client_payment(uuid, numeric) to authenticated;
grant execute on function public.search_sales(timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.analytics(timestamptz, timestamptz, text) to authenticated;
