"use client";

import { useEffect } from "react";
import { useAppStore, type Persona } from "@/store/useAppStore";

const apiBase = () =>
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws")
    .replace(/^ws/, "http")
    .replace(/\/ws$/, "");

/** Loads the persona roster once. The backend owns who exists and which model they use. */
export const usePersonas = () => {
  const setPersonas = useAppStore((state) => state.setPersonas);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(`${apiBase()}/personas`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`personas request failed: ${response.status}`);
        }
        const data = (await response.json()) as { default: string; personas: Persona[] };
        setPersonas(data.personas ?? [], data.default);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[personas] failed to load", error);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [setPersonas]);
};
