"use client";

import { useEffect, useRef, useState } from "react";

const PASSWORD_STORAGE_KEY = "hoe_admin_password";

// "Mark as test" / "Unhide" control for an order row. Click reveals a tiny
// inline password field (remembered in localStorage after first use, same
// pattern as OrderStatusQuickEdit) so hiding junk/test orders doesn't
// require leaving the list.
export default function HideOrderToggle({
  orderId,
  hidden,
  returnTo,
}: {
  orderId: string;
  hidden: boolean;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (saved) setPassword(saved);
  }, []);

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
      ref={formRef}
      action="/api/orders/toggle-hidden"
      method="POST"
      style={{ display: "flex", gap: 4, alignItems: "center" }}
      onSubmit={() => {
        if (password) window.localStorage.setItem(PASSWORD_STORAGE_KEY, password);
        setSaving(true);
      }}
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      <input type="hidden" name="return_to" value={returnTo} />

      <input
        type="password"
        name="admin_password"
        placeholder="Password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          width: 90,
          padding: "3px 6px",
          fontSize: 11,
          borderRadius: 6,
          border: "1px solid #eee",
        }}
      />

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
