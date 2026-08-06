"use client";

import { useState } from "react";

// Small inline "copy to clipboard" button — used next to phone numbers on
// the orders list so you can grab a number without selecting text by hand.
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard API can be blocked (e.g. non-HTTPS) — fail silently,
          // the number is still visible to copy manually.
        }
      }}
      title="Copy phone number"
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "0 0 0 6px",
        fontSize: 12,
        color: copied ? "#166534" : "#9a8f80",
        fontWeight: copied ? 700 : 400,
      }}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}
