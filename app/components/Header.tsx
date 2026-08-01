import Link from "next/link";

export const NAV_ITEMS: { key: string; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "orders", label: "Orders", href: "/orders" },
  { key: "customers", label: "Customers", href: "/customers" },
  { key: "abandoned-carts", label: "Abandoned Carts", href: "/abandoned-carts" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "campaign-history", label: "Campaign History", href: "/campaign-history" },
  { key: "inbox", label: "Inbox", href: "/inbox" },
  { key: "templates", label: "Templates", href: "/templates" },
  { key: "messages", label: "Message Logs", href: "/messages" },
];

// Shared brand header + nav, used on every page for a consistent look.
// `active` highlights the current section; `back` adds a small breadcrumb
// underneath for detail pages (e.g. a single order or a single chat).
export default function Header({
  active,
  back,
}: {
  active?: string;
  back?: { href: string; label: string };
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          background: "#fff",
          border: "1px solid #eadfce",
          borderRadius: 18,
          padding: "14px 20px",
          boxShadow: "0 8px 22px rgba(0,0,0,.04)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#1c1712",
              color: "#e8c88a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            E
          </span>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                color: "#1c1712",
                letterSpacing: 0.4,
                lineHeight: 1.2,
              }}
            >
              HOUSE OF EON
            </div>
            <div style={{ fontSize: 11, color: "#9a8f80", lineHeight: 1.2 }}>
              WhatsApp Commerce Console
            </div>
          </div>
        </Link>

        <nav style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  textDecoration: "none",
                  background: isActive ? "#1c1712" : "transparent",
                  color: isActive ? "#fff" : "#544c42",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {back && (
        <div style={{ marginTop: 12 }}>
          <Link
            href={back.href}
            style={{ fontSize: 13, color: "#9a8f80", textDecoration: "none" }}
          >
            ← {back.label}
          </Link>
        </div>
      )}
    </div>
  );
}
