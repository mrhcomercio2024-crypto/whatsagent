/**
 * saveCreds com debounce por agente + flush síncrono.
 *
 * Baileys pode chamar `creds.update` DEZENAS de vezes por segundo em rajadas
 * (sync de chaves Signal, app-state). Cada chamada faz:
 *   1. `rawSaveCreds()` -> escreve múltiplos arquivos no disco
 *   2. `snapshotAuthDirToDb()` -> serializa TUDO e dá `UPDATE qr_sessions`
 *
 * Sem debounce, isso satura o pool MySQL (`ER_CON_COUNT_ERROR`) e pressiona
 * o disco. Com debounce, agrupamos várias atualizações em uma só (mantendo
 * apenas o snapshot mais recente — Baileys é eventually-consistent).
 */

export type SaveFn = () => Promise<void>;

type Pending = {
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  pendingRun: boolean; // marcação: pediram de novo enquanto rodava
};

const state = new Map<number, Pending>();

function getState(agentId: number): Pending {
  let s = state.get(agentId);
  if (!s) {
    s = { timer: null, inflight: null, pendingRun: false };
    state.set(agentId, s);
  }
  return s;
}

/**
 * Cria uma versão debounced de `save`, por `agentId`.
 *
 * Comportamento:
 * - Chamadas sucessivas agrupam em 1 execução após `delayMs` ms sem novas chamadas.
 * - Se uma execução já estiver em andamento e nova chamada chegar, marca `pendingRun`
 *   e, ao terminar, reagenda imediatamente (garante que o último estado seja persistido).
 * - `flush(agentId)` força execução imediata (ideal para SIGTERM).
 */
export function debouncedSave(
  agentId: number,
  save: SaveFn,
  delayMs: number = 2000
): () => void {
  return () => {
    const s = getState(agentId);
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(async () => {
      s.timer = null;
      await runNow(agentId, save);
    }, delayMs);
  };
}

async function runNow(agentId: number, save: SaveFn): Promise<void> {
  const s = getState(agentId);
  if (s.inflight) {
    // já rodando: marca para reexecutar depois
    s.pendingRun = true;
    return s.inflight;
  }
  const p = (async () => {
    try {
      await save();
    } catch (e) {
      console.warn(
        `[baileys.credsSaver] save failed for agent ${agentId}:`,
        (e as Error).message
      );
    }
  })();
  s.inflight = p;
  await p;
  s.inflight = null;
  if (s.pendingRun) {
    s.pendingRun = false;
    // Reexecuta imediatamente o último estado
    return runNow(agentId, save);
  }
}

/**
 * Força execução imediata do save pendente (cancela timer).
 * Útil para SIGTERM/SIGINT.
 */
export async function flushSave(agentId: number, save: SaveFn): Promise<void> {
  const s = getState(agentId);
  if (s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
  await runNow(agentId, save);
}

/**
 * Flush de todos os agentes com saves pendentes.
 */
export async function flushAll(
  saveByAgent: (agentId: number) => SaveFn
): Promise<void> {
  const ids: number[] = [];
  state.forEach((_v, k) => ids.push(k));
  await Promise.all(
    ids.map(async (id) => {
      try {
        await flushSave(id, saveByAgent(id));
      } catch (e) {
        console.warn(
          `[baileys.credsSaver] flushAll failed for agent ${id}:`,
          (e as Error).message
        );
      }
    })
  );
}

/** Calcula checksum simples (soma de bytes) sobre uma string; para validar snapshots. */
export function quickChecksum(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Apenas para testes. */
export function _resetCredsSaverForTest(): void {
  state.forEach((s) => {
    if (s.timer) clearTimeout(s.timer);
  });
  state.clear();
}
