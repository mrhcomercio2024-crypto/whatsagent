import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Replica a semântica do scheduler fixed window do Simulador (front).
 * Garante que mensagens subsequentes não reiniciam o timer.
 */
function makeScheduler(opts: { debounceSec: number; onFire: (queue: string[]) => void }) {
  let timer: any = null;
  const queue: string[] = [];
  let leftAtStart = 0;

  function schedule() {
    if (timer !== null) return; // janela em andamento → não reinicia
    leftAtStart = opts.debounceSec;
    let left = leftAtStart;
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        timer = null;
        const flushed = queue.splice(0, queue.length);
        opts.onFire(flushed);
      }
    }, 1000);
  }

  function push(text: string) {
    queue.push(text);
    schedule();
  }

  return {
    push,
    isPending: () => timer !== null,
    queueLen: () => queue.length,
  };
}

describe("simulator debounce — fixed window", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("1ª mensagem inicia a janela e dispara após N segundos", () => {
    const onFire = vi.fn();
    const s = makeScheduler({ debounceSec: 5, onFire });
    s.push("oi");
    expect(s.isPending()).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith(["oi"]);
  });

  it("mensagens subsequentes NÃO reiniciam o timer (fixed window)", () => {
    const onFire = vi.fn();
    const s = makeScheduler({ debounceSec: 5, onFire });
    s.push("oi");
    vi.advanceTimersByTime(2_000);
    s.push("tudo bem?");
    vi.advanceTimersByTime(2_000);
    s.push("?");
    vi.advanceTimersByTime(1_000); // 5s totais desde a 1ª
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith(["oi", "tudo bem?", "?"]);
  });

  it("após disparar, libera o slot para a próxima janela", () => {
    const onFire = vi.fn();
    const s = makeScheduler({ debounceSec: 3, onFire });
    s.push("a");
    vi.advanceTimersByTime(3_000);
    expect(onFire).toHaveBeenLastCalledWith(["a"]);
    expect(s.isPending()).toBe(false);

    s.push("b");
    expect(s.isPending()).toBe(true);
    vi.advanceTimersByTime(3_000);
    expect(onFire).toHaveBeenCalledTimes(2);
    expect(onFire).toHaveBeenLastCalledWith(["b"]);
  });

  it("rajada de 4 mensagens dentro da janela: ainda 1 turno só", () => {
    const onFire = vi.fn();
    const s = makeScheduler({ debounceSec: 8, onFire });
    s.push("1");
    vi.advanceTimersByTime(1_000);
    s.push("2");
    vi.advanceTimersByTime(1_000);
    s.push("3");
    vi.advanceTimersByTime(1_000);
    s.push("4");
    vi.advanceTimersByTime(5_000); // total 8s
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith(["1", "2", "3", "4"]);
  });
});
