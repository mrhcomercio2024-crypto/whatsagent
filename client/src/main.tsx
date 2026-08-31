import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const isPublicSimulator = () => window.location.pathname.startsWith("/simulador/");

const recoverPublicSimulatorChunk = (reason: string) => {
  if (!isPublicSimulator()) return;
  const key = "ravi:asset-recovery";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, reason);
  window.location.reload();
};

window.addEventListener("vite:preloadError", event => {
  event.preventDefault();
  recoverPublicSimulatorChunk("vite-preload-error");
});

window.addEventListener("error", event => {
  const message = String(event.message || "");
  if (/module script|dynamically imported|failed to fetch|loading chunk/i.test(message)) {
    recoverPublicSimulatorChunk("asset-load-error");
  }
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  // A conversa pública usa seu próprio token anônimo. Uma chamada protegida
  // acidental nunca deve expulsar o visitante para /login no meio do fluxo.
  if (isPublicSimulator()) return;
  // Já estamos na tela de login — evita loop
  if (window.location.pathname === "/login") return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
