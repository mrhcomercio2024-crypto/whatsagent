import { eq } from "drizzle-orm";
import { getDb } from "/home/ubuntu/whatsagent/server/db";
import { instagramIntegrations } from "/home/ubuntu/whatsagent/drizzle/schema";
import { decryptInstagramToken } from "/home/ubuntu/whatsagent/server/instagram/crypto";
import { instagramEnv } from "/home/ubuntu/whatsagent/server/instagram/config";

type GraphResult = {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: { message: string; code?: string; subcode?: string; type?: string };
};

async function graph(path: string, token: string, params: Record<string, string> = {}): Promise<GraphResult> {
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || payload?.error) {
      return {
        ok: false,
        status: response.status,
        error: {
          message: String(payload?.error?.message || `Meta HTTP ${response.status}`).slice(0, 500),
          code: payload?.error?.code != null ? String(payload.error.code) : undefined,
          subcode: payload?.error?.error_subcode != null ? String(payload.error.error_subcode) : undefined,
          type: payload?.error?.type != null ? String(payload.error.type) : undefined,
        },
      };
    }
    return { ok: true, status: response.status, data: payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: {
        message: error instanceof Error ? error.message.slice(0, 500) : "Graph request failed",
        type: "TRANSPORT_ERROR",
      },
    };
  }
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [integration] = await db
    .select()
    .from(instagramIntegrations)
    .where(eq(instagramIntegrations.agentId, 1))
    .limit(1);
  if (!integration?.accessTokenEncrypted || !integration.facebookPageId || !integration.instagramAccountId) {
    throw new Error("INSTAGRAM_INTEGRATION_INCOMPLETE");
  }

  const token = decryptInstagramToken(integration.accessTokenEncrypted);
  const { appId, appSecret, graphVersion } = instagramEnv();
  const appAccessToken = `${appId}|${appSecret}`;

  const [debugToken, permissions, pageSubscriptions, instagramSubscriptions, appInfo, appRoles, appSubscriptions, instagramProfile] = await Promise.all([
    graph("debug_token", appAccessToken, { input_token: token }),
    graph("me/permissions", token),
    graph(`${integration.facebookPageId}/subscribed_apps`, token),
    graph(`${integration.instagramAccountId}/subscribed_apps`, token),
    graph(appId, appAccessToken, { fields: "id,name,app_domains,link,category" }),
    graph(`${appId}/roles`, appAccessToken),
    graph(`${appId}/subscriptions`, appAccessToken),
    graph(integration.instagramAccountId, token, { fields: "id,username,name,profile_picture_url,followers_count" }),
  ]);

  console.log(JSON.stringify({
    integration: {
      id: integration.id,
      oauthProvider: integration.oauthProvider,
      pageId: integration.facebookPageId,
      pageName: integration.facebookPageName,
      instagramAccountId: integration.instagramAccountId,
      username: integration.username,
      isConnected: integration.isConnected,
      tokenStatus: integration.tokenStatus,
      webhookStatus: integration.webhookStatus,
    },
    graphVersion,
    debugToken,
    permissions,
    pageSubscriptions,
    instagramSubscriptions,
    appInfo,
    appRoles,
    appSubscriptions,
    instagramProfile,
  }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "PROBE_FAILED");
  process.exitCode = 1;
});
