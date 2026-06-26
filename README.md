# HOUSE OF EON WhatsApp Cloud API Starter

A small standalone Next.js project to test the official Meta WhatsApp Cloud API without WATI/Interakt.

## Features
- Import old customers by CSV
- Store customers in Supabase
- Send approved WhatsApp template messages
- Receive inbound replies and delivery statuses via webhook
- Simple internal admin password protection for send/import actions

## CSV format
```csv
name,phone,product,city,last_order_date
Manoj,9876543210,RANK,Chennai,2026-06-01
```
Phone can be 10 digit India mobile or country-code format like `919876543210`.

## Supabase setup
1. Create a Supabase project.
2. Open SQL editor.
3. Run `supabase/migrations/001_init.sql`.
4. Copy Supabase URL, anon key, and service role key.

## Meta setup
1. Create Meta Developer app and add WhatsApp product.
2. Get `Phone Number ID`.
3. Generate access token. For production, create a system user permanent token.
4. Create/approve a message template, for example `hoe_new_launch` with two body variables.
5. Webhook callback URL after deploy:
   `https://YOUR-DOMAIN.com/api/webhook/whatsapp`
6. Verify token must match `META_VERIFY_TOKEN` in env.
7. Subscribe webhook field: `messages`.

## Environment variables
Copy `.env.example` to `.env.local` for local development or add them in Vercel.

## Local run
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to GitHub.
2. Import project in Vercel.
3. Add all env variables.
4. Deploy.

## Important
- Marketing messages must use approved Meta templates.
- Send to small batches first.
- Keep opt-out/STOP handling before doing large campaigns.
- This is a starter project; add proper login before real production use.
