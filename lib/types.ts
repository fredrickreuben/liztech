export type Role = "admin" | "staff";
export type SaleStatus = "paid" | "partial" | "credit";
export type PaymentMethod = "cash" | "mpesa";

export type Profile = {
  id: string;
  email: string;
  username: string;
  role: Role;
};

export type Service = {
  id: string;
  name: string;
  price: number;
};

export type ClientBalance = {
  id: string;
  name: string;
  phone: string;
  billed: number;
  paid: number;
  balance: number;
  last_sale_at: string | null;
  notes: string | null;
};

export type SaleItem = {
  name: string;
  quantity: number;
  unit_price: number;
  list_price: number | null;
  line_total: number;
};

export type SaleRow = {
  id: string;
  client_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  amount_paid: number;
  balance: number;
  status: SaleStatus;
  created_at: string;
  staff: string | null;
  items: SaleItem[];
};

export type SalesSearchResult = {
  count: number;
  total: number;
  paid: number;
  balance: number;
  rows: SaleRow[];
};

export type BillFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type ExpensePreset = {
  id: string;
  name: string;
  default_amount: number;
  frequency: BillFrequency | null;
  next_due_on: string | null;
};

export type ExpenseRow = {
  id: string;
  name: string;
  amount: number;
  note: string | null;
  due_on: string | null;
  created_at: string;
  staff: { username: string } | null;
};

export type Analytics = {
  sales_total: number;
  sale_count: number;
  collected: number;
  credit_given: number;
  outstanding: number;
  expenses_total: number;
  all_time_balance: number;
  by_method: { cash: number; mpesa: number; unspecified: number };
  by_day: { day: string; sales: number; collected: number }[];
  top_services: { name: string; quantity: number; revenue: number }[];
  by_staff: { username: string; sales: number; sale_count: number }[];
};
