import { createContext, useContext, useEffect, useState } from "react";
import { useApi } from "./ApiClientContext";

export interface LocalDevInfo {
  environment: string;
  downloadStreamEnabled: boolean;
  authDevBypassEnabled: boolean;
}

const DEFAULT: LocalDevInfo = {
  environment: "Production",
  downloadStreamEnabled: false,
  authDevBypassEnabled: false,
};

export interface LocalDevContextValue {
  info: LocalDevInfo;
  loading: boolean;
  unavailable: boolean;
}

const LocalDevContext = createContext<LocalDevContextValue | null>(null);

export function LocalDevProvider(props: { children: React.ReactNode }): JSX.Element {
  const api = useApi();
  const [info, setInfo] = useState<LocalDevInfo>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<LocalDevInfo>("/api/v1/local-dev/info")
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setUnavailable(false);
      })
      .catch(() => {
        if (cancelled) return;
        // 404 in non-Development, or network error. The dev content route
        // will not be available, so the UI falls back to the SAS URL path.
        setInfo(DEFAULT);
        setUnavailable(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <LocalDevContext.Provider value={{ info, loading, unavailable }}>
      {props.children}
    </LocalDevContext.Provider>
  );
}

export function useLocalDev(): LocalDevContextValue {
  const ctx = useContext(LocalDevContext);
  if (!ctx) {
    throw new Error("useLocalDev must be used inside <LocalDevProvider>");
  }
  return ctx;
}
