export interface DevBypassConfig {
  enabled: boolean;
  schoolId: string;
  userId: string;
}

const STORAGE_KEY = "asa.devBypass.v1";

const DEFAULT_CONFIG: DevBypassConfig = {
  enabled: true,
  schoolId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

function loadConfig(): DevBypassConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<DevBypassConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      schoolId: parsed.schoolId ?? DEFAULT_CONFIG.schoolId,
      userId: parsed.userId ?? DEFAULT_CONFIG.userId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: DevBypassConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage may be unavailable; the in-memory state is still authoritative.
  }
}

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface DevBypassContextValue {
  config: DevBypassConfig;
  setConfig: (next: DevBypassConfig) => void;
}

const DevBypassContext = createContext<DevBypassContextValue | null>(null);

export function DevBypassProvider(props: { children: React.ReactNode }): JSX.Element {
  const [config, setConfigState] = useState<DevBypassConfig>(() => loadConfig());

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const value = useMemo<DevBypassContextValue>(
    () => ({ config, setConfig: setConfigState }),
    [config]
  );

  return (
    <DevBypassContext.Provider value={value}>{props.children}</DevBypassContext.Provider>
  );
}

export function useDevBypass(): DevBypassContextValue {
  const ctx = useContext(DevBypassContext);
  if (!ctx) {
    throw new Error("useDevBypass must be used inside <DevBypassProvider>");
  }
  return ctx;
}
