"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_KEY = "hoe-courier-refresh-started-at";

type RefreshState = "idle" | "refreshing" | "success" | "error";

export default function CourierRefresh({ className }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("Refresh tracking");

  async function refresh(force: boolean) {
    if (state === "refreshing") return;
    setState("refreshing");
    setMessage("Refreshing tracking…");
    if (!force) sessionStorage.setItem(SESSION_KEY, String(Date.now()));

    try {
      const response = await fetch("/api/orders/background-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Courier refresh failed");

      const checked = (result.delhivery?.checked || 0) + (result.shadowfax?.checked || 0);
      const updated = (result.delhivery?.updated || 0) + (result.shadowfax?.updated || 0) + (result.cod?.completed || 0);
      setState("success");
      setMessage(checked ? `Updated ${updated} of ${checked} checked` : "Tracking is up to date");
      router.refresh();
    } catch (error: any) {
      setState("error");
      setMessage(error.message || "Refresh failed — try again");
    }
  }

  useEffect(() => {
    const lastStarted = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    if (Date.now() - lastStarted >= AUTO_REFRESH_INTERVAL_MS) {
      void refresh(false);
    }
    // Run once when the Orders workspace mounts. router.refresh preserves
    // this component state, avoiding a refresh loop after completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className} title="Tracking refresh runs in the background; the Orders page remains usable.">
      <button type="button" disabled={state === "refreshing"} onClick={() => void refresh(true)}>
        {state === "refreshing" ? "↻" : state === "success" ? "✓" : state === "error" ? "⚠" : "↻"} {message}
      </button>
    </div>
  );
}

