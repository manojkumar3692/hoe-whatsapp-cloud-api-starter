"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
  "rejected",
];

const PASSWORD_STORAGE_KEY = "hoe_admin_password";

// Quick-edit dropdown for the orders list — picks a new status and submits
// immediately, no need to open the order detail page for a simple status
// change. Re-submits the order's existing payment_status / tracking_url /
// notes unchanged (the update route overwrites those fields with whatever
// it receives, so they have to be included here or they'd get wiped).
export default function OrderStatusQuickEdit({
  orderId,
  paymentStatus,
  currentStatus,
  trackingUrl,
  notes,
  returnTo,
}: {
  orderId: string;
  paymentStatus: string;
  currentStatus: string;
  trackingUrl: string | null;
  notes: string | null;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (saved) setPassword(saved);
  }, []);

  return (
    <form
      ref={formRef}
      action="/api/orders/update"
      method="POST"
      style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}
      onSubmit={() => {
        if (password) window.localStorage.setItem(PASSWORD_STORAGE_KEY, password);
        setSaving(true);
      }}
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="payment_status" value={paymentStatus} />
      <input type="hidden" name="tracking_url" value={trackingUrl || ""} />
      <input type="hidden" name="notes" value={notes || ""} />
      <input type="hidden" name="return_to" value={returnTo} />

      <select
        name="shipping_status"
        defaultValue={currentStatus}
        disabled={saving}
        onChange={() => formRef.current?.requestSubmit()}
        style={{
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid #ddd",
          fontSize: 12,
          fontWeight: 700,
          background: saving ? "#f3f4f6" : "#fff",
        }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <input
        type="password"
        name="admin_password"
        placeholder="Admin password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          padding: "4px 6px",
          borderRadius: 6,
          border: "1px solid #eee",
          fontSize: 11,
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </form>
  );
}
