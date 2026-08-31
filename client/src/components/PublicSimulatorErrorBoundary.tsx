import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class PublicSimulatorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      sessionStorage.setItem(
        "ravi:last-client-error",
        JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 1800),
          componentStack: info.componentStack?.slice(0, 1800),
          at: new Date().toISOString(),
        }),
      );
    } catch {
      // A recuperação visual não depende da telemetria local.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#071015] px-6 text-center text-[#e9edef]">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[#00a884]/15 text-xl text-[#00a884]">
            ↻
          </div>
          <h1 className="text-lg font-semibold">Reconectando sua conversa</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#aebac1]">
            Seu histórico está salvo. Toque abaixo para continuar do mesmo ponto.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-[#00a884] px-5 py-3 text-sm font-semibold text-[#071611]"
          >
            Continuar conversa
          </button>
        </div>
      </div>
    );
  }
}
