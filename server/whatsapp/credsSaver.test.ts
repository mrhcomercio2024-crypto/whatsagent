import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  debouncedSave,
  flushSave,
  quickChecksum,
  _resetCredsSaverForTest,
} from "./credsSaver";

describe("credsSaver: debounce + flush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCredsSaverForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    _resetCredsSaverForTest();
  });

  it("agrupa várias chamadas em 1 execução (debounce fixed-reset)", async () => {
    const save = vi.fn(async () => {});
    const trigger = debouncedSave(1, save, 1000);
    trigger();
    trigger();
    trigger();
    trigger();
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reseta o timer a cada nova chamada", async () => {
    const save = vi.fn(async () => {});
    const trigger = debouncedSave(2, save, 1000);
    trigger();
    await vi.advanceTimersByTimeAsync(500);
    trigger(); // reseta
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushSave executa imediatamente mesmo sem timer", async () => {
    const save = vi.fn(async () => {});
    await flushSave(3, save);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushSave cancela o timer debounced e executa uma vez", async () => {
    const save = vi.fn(async () => {});
    const trigger = debouncedSave(4, save, 1000);
    trigger();
    trigger();
    await flushSave(4, save);
    expect(save).toHaveBeenCalledTimes(1);
    // Avança o tempo: timer foi cancelado, não deve chamar de novo
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("erro em save não quebra a cadeia de debounce", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const trigger = debouncedSave(5, save, 500);
    trigger();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    // Nova rodada deve funcionar
    trigger();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("quickChecksum é determinístico e diferente para conteúdos distintos", () => {
    expect(quickChecksum("abc")).toBe(quickChecksum("abc"));
    expect(quickChecksum("abc")).not.toBe(quickChecksum("abd"));
    expect(quickChecksum("")).toBe(0);
  });
});
