# Eon Genie

Open `/genie` from Home, the main navigation or Accounts. No database migration
is required. Inventory must already be installed. The dashboard reads all
non-hidden order pages and SKU records server-side; no customer identity fields
are selected. Failed reads show an unavailable state, never a partial total.

Monthly and Monday-based weekly comparisons use equal completed Dubai days,
excluding today. Month-end comparisons cap the day count at the shorter month.
On the first day of a period there are no completed days. The pulse chart uses
28 complete days. History is limited to recorded orders, not the lifetime of
the business. Each page load and AI question fetches a fresh snapshot.

Paid order value includes tax and uncollected COD. Cancelled, refunded, returned,
rejected, return-requested and disputed orders are excluded. This is not cash,
profit or the gross Accounts register. Invalid amounts are excluded and counted.
All-time and current snapshots can change when order statuses are corrected.

Product counts reuse the finance SKU mapper. An incompletely mapped order still
contributes valid order value but no product units. Mapping omissions are shown.
8ml counts include individual Trial Pack selections; Trial Pack sets are shown
separately. Stock cover uses current on-hand stock / average daily units in the
last 28 days. It does not subtract reservations or predict demand. New products
have shorter exposure, so their pace should not be compared uncritically.

## Optional AI chat

Set `OPENAI_API_KEY` and `OPENAI_GENIE_MODEL` in server environment settings.
Choose a Responses API text model available to the API project. Do not expose
these as NEXT_PUBLIC variables. The dashboard works with no AI credentials;
chat explicitly shows its disconnected state. Configure an API project budget
before enabling the paid connection. The implementation follows the official
[text generation guide](https://developers.openai.com/api/docs/guides/text).

Chat sends the computed aggregate snapshot plus the question and at most six
prior messages to OpenAI, with `store: false`. Customer identities and individual
order records are not sent. Product labels are treated as untrusted data. Users
should not type personal customer details into questions. Conversation history
is held only in browser memory. There are no tools for writes, campaigns or
arbitrary database queries. API requests require the admin session and matching
origin, validate input size, bound output and time out. No automatic calls occur
on page load. Provider failures are shown without exposing keys or raw errors.

AI can discuss month/week comparisons, daily history, product units and stock.
It cannot establish margins, ad attribution, conversion, retention or causation
from this snapshot. Deterministic recommendations remain available without AI.

Run `npm run test:genie` with Node 20.9+ and `npx tsc --noEmit`.
