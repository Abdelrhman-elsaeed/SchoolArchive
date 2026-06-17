import { createContext, useContext, useMemo } from "react";
import { ApiClient } from "./ApiClient";
import { useDevBypass } from "../config/DevBypassContext";

const ApiClientContext = createContext<ApiClient | null>(null);

interface ApiClientProviderProps {
  children: React.ReactNode;
  baseUrl?: string;
}

function resolveApiBaseUrl(propValue: string | undefined): string {
  if (propValue && propValue.trim() !== "") return propValue;
  const fromEnv = import.meta.env?.VITE_API_BASE_URL;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  if (typeof window !== "undefined") {
    const fromGlobal = (window as unknown as { __ASA_API_BASE__?: string }).__ASA_API_BASE__;
    if (fromGlobal && fromGlobal.trim() !== "") return fromGlobal;
  }
  return "";
}

export function ApiClientProvider(props: ApiClientProviderProps): JSX.Element {
  const { config } = useDevBypass();

  const client = useMemo<ApiClient>(() => {
    return new ApiClient({
      baseUrl: resolveApiBaseUrl(props.baseUrl),
      getDevBypassHeaders: () => {
        if (!config.enabled) return {} as Record<string, string>;
        return {
          "X-Dev-School-Id": config.schoolId,
          "X-Dev-User-Id": config.userId,
        } as Record<string, string>;
      },
    });
  }, [props.baseUrl, config.enabled, config.schoolId, config.userId]);

  return (
    <ApiClientContext.Provider value={client}>{props.children}</ApiClientContext.Provider>
  );
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiClientContext);
  if (!ctx) {
    throw new Error("useApi must be used inside <ApiClientProvider>");
  }
  return ctx;
}
