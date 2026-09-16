"use client";

import Link from "next/link";
import { useState } from "react";
import PushNotifications from "./PushNotifications";

export const NAV_ITEMS = [
  { key: "home", label: "Home", href: "/" },
  { key: "orders", label: "Orders", href: "/orders" },
  { key: "inventory", label: "Inventory", href: "/inventory" },
  { key: "customers", label: "Customers", href: "/customers" },
  { key: "follow-ups", label: "Follow-ups", href: "/follow-ups" },
  { key: "abandoned-carts", label: "Abandoned Carts", href: "/abandoned-carts" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "campaign-history", label: "Campaign History", href: "/campaign-history" },
  { key: "inbox", label: "Inbox", href: "/inbox" },
  { key: "templates", label: "Templates", href: "/templates" },
  { key: "messages", label: "Message Logs", href: "/messages" },
];

export default function Header({ active, back }: {
  active?: string;
  back?: { href: string; label: string };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="app-header">
      <div className="header-bar">
        <Link href="/" className="brand-link">
          <span className="brand-mark">E</span>
          <span><strong>HOUSE OF EON</strong><small>WhatsApp Commerce Console</small></span>
        </Link>
        <button type="button" className="mobile-menu-toggle" aria-expanded={menuOpen}
          aria-controls="dashboard-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "Close menu" : "Menu"}
        </button>
        <div id="dashboard-navigation" className={`header-navigation ${menuOpen ? "is-open" : ""}`}>
          <nav aria-label="Main navigation">
            {NAV_ITEMS.map(item => (
              <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}
                onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
          </nav>
          <div className="header-tools">
            <PushNotifications />
            <form action="/api/auth/logout" method="POST"><button type="submit" className="logout-button">Logout</button></form>
          </div>
        </div>
      </div>
      {back && <Link className="back-link" href={back.href}>← {back.label}</Link>}
    </header>
  );
}
