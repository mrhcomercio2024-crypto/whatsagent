export type RaviWebMode = "lite" | "advanced";

export function normalizeRaviWebMode(value: unknown): RaviWebMode {
  return value === "advanced" ? "advanced" : "lite";
}

export function isRaviWebLite(value: unknown): boolean {
  return normalizeRaviWebMode(value) === "lite";
}

