export type Role = "admin" | "staff";
export type SaleStatus = "paid" | "partial" | "credit";

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
};

export type SaleItem = {
  name: string;
  quantity: number;
  unit_price: number;
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

export type Analytics = {
  sales_total: number;
  sale_count: number;
  collected: number;
  credit_given: number;
  outstanding: number;
  by_day: { day: string; sales: number; collected: number }[];
  top_services: { name: string; quantity: number; revenue: number }[];
  by_staff: { username: string; sales: number; sale_count: number }[];
};
