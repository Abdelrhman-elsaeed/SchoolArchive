import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./ui/App";
import { ApiClientProvider } from "./api/ApiClientContext";
import { LocalDevProvider } from "./api/LocalDevContext";
import { DevBypassProvider } from "./config/DevBypassContext";
import "./ui/styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DevBypassProvider>
        <ApiClientProvider>
          <LocalDevProvider>
            <App />
          </LocalDevProvider>
        </ApiClientProvider>
      </DevBypassProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
