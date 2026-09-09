"use client";

import { useState } from "react";

// "Mark as test" / "Unhide" control for an order row. Click reveals a tiny
// confirmation so hiding junk/test orders doesn't require leaving the list.
export default function HideOrderToggle({
  orderId,
  hidden,
  returnTo,
}: {
  orderId: string;
  hidden: boolean;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: "1px solid #eee",
          background: "#fff",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 11,
          color: "#9a8f80",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {hidden ? "Unhide" : "Mark as test"}
      </button>
    );
  }

  return (
    <form
      action="/api/orders/toggle-hidden"
      method="POST"
      style={{ display: "flex", gap: 4, alignItems: "center" }}
      onSubmit={() => setSaving(true)}
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      <input type="hidden" name="return_to" value={returnTo} />

      <button
        type="submit"
        disabled={saving}
        style={{
          border: "none",
          background: hidden ? "#166534" : "#991b1b",
          color: "#fff",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {saving ? "..." : hidden ? "Unhide" : "Hide"}
      </button>
    </form>
  );
}
