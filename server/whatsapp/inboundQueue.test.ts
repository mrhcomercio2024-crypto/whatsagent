import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  pendingCount,
  activeKeysCount,
  _resetQueueForTest,
} from "./inboundQueue";

describe("inboundQueue: fila FIFO por chave", () => {
  beforeEach(() => _resetQueueForTest());

  it("executa tasks da mesma chave em ordem estrita", async () => {
    const log: number[] = [];
    const mk = (n: number, delay: number) =>
      enqueue("A", async () => {
        await new Promise((r) => setTimeout(r, delay));
        log.push(n);
      });
    // Task 1 demora mais, mas deve terminar antes da 2
    const p1 = mk(1, 40);
    const p2 = mk(2, 5);
    const p3 = mk(3, 5);
    await Promise.all([p1, p2, p3]);
    expect(log).toEqual([1, 2, 3]);
  });

  it("chaves diferentes executam em paralelo", async () => {
    const events: Array<[string, "start" | "end"]> = [];
    const mk = (key: string) =>
      enqueue(key, async () => {
        events.push([key, "start"]);
        await new Promise((r) => setTimeout(r, 20));
        events.push([key, "end"]);
      });
    await Promise.all([mk("A"), mk("B"), mk("C")]);
    // Todos os "start" saem antes de qualquer "end" — paralelismo real
    const starts = events.slice(0, 3).map(([k, kind]) => kind);
    expect(starts).toEqual(["start", "start", "start"]);
  });

  it("retorna o valor da task", async () => {
    const r = await enqueue("A", async () => 42);
    expect(r).toBe(42);
  });

  it("erro em uma task não contamina a próxima", async () => {
    const log: string[] = [];
    const p1 = enqueue("X", async () => {
      log.push("t1-start");
      throw new Error("boom");
    });
    const p2 = enqueue("X", async () => {
      log.push("t2");
      return "ok";
    });
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
    expect(log).toEqual(["t1-start", "t2"]);
  });

  it("pendingCount reflete as tarefas não concluídas", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const p1 = enqueue("K", async () => {
      await gate;
    });
    const p2 = enqueue("K", async () => {});
    expect(pendingCount("K")).toBe(2);
    release();
    await Promise.all([p1, p2]);
    expect(pendingCount("K")).toBe(0);
  });

  it("esvazia a fila após todas as tasks", async () => {
    await enqueue("A", async () => {});
    await enqueue("B", async () => {});
    // pode levar 1 tick para limpar
    await new Promise((r) => setTimeout(r, 5));
    expect(activeKeysCount()).toBe(0);
  });

  it("rajada de 10 mensagens processa exatamente uma de cada vez", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      tasks.push(
        enqueue("R", async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
        })
      );
    }
    await Promise.all(tasks);
    expect(maxActive).toBe(1);
  });
});
