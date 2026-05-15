"use client";

import { useAppStore } from "@/store/useAppStore";

export const ConnectionStatus = () => {
  const status = useAppStore((state) => state.connectionStatus);
  const label =
    status === "open"
      ? "Connected"
      : status === "connecting"
      ? "Connecting"
      : status === "error"
      ? "Error"
      : "Offline";

  return (
    <div className="status-dot" data-state={status}>
      <span />
      {label}
    </div>
  );
};
