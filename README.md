# Liz Cyber Tech POS

A simple point of sale for a cybercafe. It tracks daily sales and client credit, and works on a phone or a computer.

Built with Next.js, Tailwind CSS, Lucide icons and Supabase.

## What it does

- **Sell:** today's summary at the top, and services as chips with their prices. Selecting chips adds up the total. Save the sale as paid, or as credit with an optional part payment.
- **Sales:** filter by date, status, service, staff, or customer.
- **Clients:** each client's balance and ledger of services and payments. A payment clears their oldest unpaid sales first.
- **Analytics:** sales, money received, credit, top services, and sales by staff for any period.
- **Admin (admins only):** add and remove services, change charges, add users, and make users admin or staff.
- **Account:** anyone can change their own username and password.

Paid sales need no customer details and are recorded as "Walk-in". Credit sales need a name and phone.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Supabase details.
2. In Supabase, open **SQL Editor**, paste all of `supabase/schema.sql`, and click **Run**.
3. In Supabase, go to **Authentication > Sign In / Providers > Email** and turn off **Confirm email**. Users are added by an admin, so there is no email step.
4. Create the first account. It must use the email `admin@liztechcyber.com`, and it becomes the admin. Sign-ups from any other email are rejected until an admin adds that user.
5. Run the app:

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Currency

Amounts use the `NEXT_PUBLIC_CURRENCY` setting, which defaults to `KSh`.
