# Accounts workspace

Open `/accounts` from the shared navigation. Sales reporting needs no new migration. Purchases, costs and advertising storage require `supabase/migrations/013_finance.sql`, after the existing inventory migration. Access uses the existing dashboard login; there is no separate accountant role yet.

## Reporting rules

- Include only `payment_status = paid`, `payment_type` of `full` or `partial_cod`, and `is_hidden = false`. Shipment status never substitutes for payment confirmation.
- Sales are gross invoice value including GST. Paid COD means the initial payment succeeded; the full invoice value contributes to sales, while token receipts and COD balance remain separate.
- Dates follow order creation in Asia/Kolkata (seller's calendar). The week starts Monday. Collections are for that cohort of orders, not a cash-flow report by settlement date.
- Paid returns and cancellations remain included and are flagged for credit-note review. Refunded payment-status records are outside the paid-only report. The report does not reconstruct historical payment status, refunds or tax reversals.
- The existing 18% inclusive invoice model is shared by PDF invoices and the GST summary. Split tax per invoice in integer paise, then sum. Unrecognized/missing states leave the split unresolved instead of assuming IGST.
- COD `collected` is a recorded status, which existing courier sync may infer from delivery; it does not confirm bank remittance.

## Downloads

`GET /api/accounts/export?month=2026-09&format=zip` produces all matching PDF invoices, a CSV sales/GST register, a paise-denominated JSON summary, a JSON review list, and explanatory notes. CSV can also be downloaded independently with `format=csv`. Downloads paginate through the database independently of the 50-row register UI.

PDFs use the same renderer as individual invoice downloads. Filenames include the order UUID to avoid collisions. Downloads are private/no-store. Large ZIPs fail explicitly above 100 MiB of file payload; they never silently truncate. Hosting response-size and execution limits may impose lower limits and will require a background export to private object storage as volume grows.

## Boundaries and next stage

This is an operational accounts workspace and working register, not GST filing software. Purchase invoices and an accounts-reviewed ITC status are recorded, but no final GST payable/refund is asserted. Completing that workflow requires verified GSTR-2B reconciliation, credit/debit notes, tax adjustments, tax payment records, and verified product rates/HSN and invoice details. GSTR-1/GSTR-3B portal upload schemas are not generated.

Month packs are regenerated from current orders, not immutable issued invoices. A future accounting ledger should preserve invoice snapshots and payment/refund/settlement events, support reconciliation and month close/reopen with an audit trail, and record filing acknowledgements. The current shared login also needs individual users/roles before accountant-specific permissions can be enforced.

## Verification

Use Node 20.9+ and run `npm run test:accounts`, `npx tsc --noEmit`, and `npm run build`. Tests cover paid eligibility, COD reconciliation, tax rounding, IST boundaries, database pagination/failures, CSV protection, ZIP extraction, PDF generation, bill/version constraints, payment idempotency/overpayment, private ledger access, cost history and mapping, expense duplication, and atomic Meta report replacement.

## Purchases and product costs

- `/accounts/purchases`: supplier invoice lines, category, service month, due date, tax components, private attachment, ITC status, payment ledger and all-month unpaid queue. A monthly ZIP exports bills by invoice date, payments by payment date and Meta daily spend. Supplier invoice PDFs/photos are downloaded individually from their bill.
- Quantities support three decimals. Unit prices use paise; round each quantity × unit cost line before summing. Purchase category applies to the entire bill. GST is entered from the actual invoice, not inferred from a fixed tax rate.
- Payments are separate from bills and do not initiate bank transfers. Database locks prevent overpayment; client-generated payment IDs make retries idempotent. Bill updates use optimistic versions to prevent lost edits. Duplicate supplier/GSTIN + invoice number + calendar year is rejected.
- Attachments are limited to 5 MiB PDF/JPEG/PNG, checked by file signature and stored in a private `accounting-documents` bucket. Replaced attachments remain available in the audit history's recorded paths; there is no public storage policy.
- `/accounts/costing`: save component quantities and costs for each existing finished-product SKU, with effective date and basis note. Standard unit cost is applied to physical units from each paid order; trial sets require exactly three identified 8 ml products. Missing or ambiguous items are review items, never zero-cost assumptions.
- Versions are retained and unique per SKU/date. Backdating a new version can change estimates for that historical period; this is not an immutable month-close ledger. Raw-material purchases do not automatically add finished stock or create FIFO raw-material valuation.
- Profit estimate = paid sales excluding invoice GST − standard product costs − recorded operating expenses − Meta spend − uncredited tax on Meta invoices. Materials purchases are not deducted a second time. Eligible input GST is excluded from expense costs; pending/ineligible GST is included conservatively. Missing order costs, returns requiring review, or incomplete Meta reports suppress the final estimate. All estimates exclude unrecorded costs and income tax.

## Meta connection and sync

Configure these **server-only** environment variables (never `NEXT_PUBLIC_`):

```
META_AD_ACCOUNT_ID=123456789
META_ADS_ACCESS_TOKEN=<read-only token with ads_read and account access>
META_ADS_API_VERSION=v23.0
```

Use an authorized Meta user/system user token with advertising account read access. The WhatsApp token is not reused. The ad account must use INR and Asia/Kolkata/Asia/Calcutta so daily spend aligns with the seller's reporting calendar; unsupported currency/time zones fail explicitly. Select a supported Graph version for the app when deploying.

The advertising screen has manual month sync. It loads the account, current campaign status/budgets, and all paginated daily campaign insights. Purchases use a single preferred action definition, avoiding duplicated aggregate/pixel purchase counts. Meta attribution is never substituted for verified paid orders. Top-level campaign active status does not prove actual ad delivery; budgets may live at ad-set level.

API errors preserve the last successful report. Reports replace one complete month transactionally and save the fetched campaign snapshot; stale overlapping syncs are rejected. No raw token or API error payload is exposed to the browser. Sync reads Meta data only; it never creates, pauses, or changes advertising campaigns.

For hourly refresh, configure repository secrets `APP_BASE_URL` and `CRON_SECRET` and set repository variable `META_SPEND_SYNC_ENABLED=true`. The provided GitHub Actions workflow then calls the authenticated GET `/api/accounts/meta/sync` for current and previous month, refreshing delayed attribution. Keep the flag unset until migration and credentials are ready. Manual POST sync uses dashboard session authentication and same-origin checks.

API reference: [Meta campaign insights](https://www.postman.com/meta/facebook-marketing-api/request/zo3xvu7/get-campaign-insights-l3), [Meta SDK insights fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py).
