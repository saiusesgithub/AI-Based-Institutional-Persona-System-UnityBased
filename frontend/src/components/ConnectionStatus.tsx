"use client";

import { useAppStore } from "@/store/useAppStore";

/** Silent while healthy; a small banner only when the connection is actually down. */
export const ConnectionStatus = () => {
  const status = useAppStore((state) => state.connectionStatus);

  if (status === "open") {
    return null;
  }

  return (
    <div className="conn-banner" role="status">
      <span className="conn-banner-dot" aria-hidden="true" />
      {status === "connecting" ? "Connecting..." : "Reconnecting..."}
    </div>
  );
};
