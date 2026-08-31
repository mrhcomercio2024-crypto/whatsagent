export type PublicRequestStatus = "processing" | "completed" | "failed" | "expired";

export const PUBLIC_REQUEST_EXPIRY_MS = 10 * 60_000;
export const PUBLIC_REQUEST_RECOVERY_TIMEOUT_MS = 120_000;
export const PUBLIC_REQUEST_RECOVERY_BACKOFF_MS = [2_000, 3_000, 5_000, 8_000] as const;

export function statusForAbsentPublicRequest(
  requestCreatedAt: number,
  now = Date.now(),
): "processing" | "expired" {
  const ageMs = Math.max(0, now - requestCreatedAt);
  return ageMs >= PUBLIC_REQUEST_EXPIRY_MS ? "expired" : "processing";
}

export function publicRequestRecoveryDelay(attempt: number): number {
  const index = Math.max(0, Math.min(Math.floor(attempt), PUBLIC_REQUEST_RECOVERY_BACKOFF_MS.length - 1));
  return PUBLIC_REQUEST_RECOVERY_BACKOFF_MS[index];
}
