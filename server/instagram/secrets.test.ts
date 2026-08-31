import { describe, expect, it } from "vitest";

const graphVersion = process.env.META_GRAPH_API_VERSION || "";
const appId = process.env.META_APP_ID || "";
const appSecret = process.env.META_APP_SECRET || "";
const verifyToken = process.env.META_INSTAGRAM_VERIFY_TOKEN || "";

describe("Instagram Meta secrets", () => {
  it("validates the supplied App ID and App Secret against Meta", async () => {
    expect(appId).toBe("2533423037090142");
    expect(graphVersion).toMatch(/^v\d+\.0$/);
    expect(appSecret.length).toBeGreaterThanOrEqual(16);

    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "client_credentials",
        }),
      },
    );
    const payload = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      error?: { code?: number; type?: string };
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(
        `META_APP_CREDENTIALS_INVALID:http=${response.status};code=${payload.error?.code ?? "unknown"};type=${payload.error?.type ?? "unknown"}`,
      );
    }

    expect(payload.access_token).toMatch(/^\d+\|/);
  }, 20_000);

  it("requires a strong Instagram Webhook verify token", () => {
    expect(verifyToken.length).toBeGreaterThanOrEqual(32);
    expect(verifyToken).not.toBe(appSecret);
  });
});
