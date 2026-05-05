import { describe, it, expect, vi, beforeEach } from "vitest";

const signedSpy = vi.fn();

vi.mock("../storage", () => ({
  storageGetSignedUrl: (key: string) => signedSpy(key),
}));

import { resolvePublicMediaUrl, _resetMediaUrlCache } from "./mediaUrlResolver";

describe("resolvePublicMediaUrl", () => {
  beforeEach(() => {
    signedSpy.mockReset();
    signedSpy.mockResolvedValue("https://cdn.example.com/key?Signature=abc");
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.APP_URL;
    _resetMediaUrlCache();
  });

  it("retorna como está quando já é http(s) absoluto", async () => {
    const out = await resolvePublicMediaUrl("https://foo.bar/x.mp4", null);
    expect(out).toBe("https://foo.bar/x.mp4");
    expect(signedSpy).not.toHaveBeenCalled();
  });

  it("converte /manus-storage/<key> para signed URL", async () => {
    const out = await resolvePublicMediaUrl(
      "/manus-storage/agent-1/media/video_a1b2.mp4",
      "agent-1/media/video_a1b2.mp4",
    );
    expect(signedSpy).toHaveBeenCalledWith("agent-1/media/video_a1b2.mp4");
    expect(out).toContain("cdn.example.com");
  });

  it("usa storageKey quando storageUrl não é manus-storage e storageKey existe", async () => {
    const out = await resolvePublicMediaUrl("legacy/path.mp4", "real/key.mp4");
    expect(signedSpy).toHaveBeenCalledWith("real/key.mp4");
    expect(out).toContain("cdn.example.com");
  });

  it("usa PUBLIC_BASE_URL como fallback quando não há key", async () => {
    process.env.PUBLIC_BASE_URL = "https://my-app.example.com";
    const out = await resolvePublicMediaUrl("/some/path.mp4", null);
    expect(out).toBe("https://my-app.example.com/some/path.mp4");
    expect(signedSpy).not.toHaveBeenCalled();
  });

  it("lança erro quando não há nem URL absoluta, nem key, nem PUBLIC_BASE_URL", async () => {
    await expect(resolvePublicMediaUrl("/manus-storage/", null)).rejects.toThrow();
  });

  it("lança erro quando ambos storageUrl e storageKey vazios", async () => {
    await expect(resolvePublicMediaUrl("", "")).rejects.toThrow(/sem URL/);
  });

  it("cacheia signed URLs por chave — segunda chamada não re-invoca o storage", async () => {
    const out1 = await resolvePublicMediaUrl(
      "/manus-storage/agent-1/foo.mp4",
      "agent-1/foo.mp4",
    );
    const out2 = await resolvePublicMediaUrl(
      "/manus-storage/agent-1/foo.mp4",
      "agent-1/foo.mp4",
    );
    expect(out1).toBe(out2);
    expect(signedSpy).toHaveBeenCalledTimes(1); // segunda chamada veio do cache
  });

  it("chaves diferentes geram chamadas diferentes", async () => {
    await resolvePublicMediaUrl("/manus-storage/k1.mp4", "k1.mp4");
    await resolvePublicMediaUrl("/manus-storage/k2.mp4", "k2.mp4");
    expect(signedSpy).toHaveBeenCalledTimes(2);
    expect(signedSpy).toHaveBeenNthCalledWith(1, "k1.mp4");
    expect(signedSpy).toHaveBeenNthCalledWith(2, "k2.mp4");
  });
});
