import { instagramEnv, INSTAGRAM_OAUTH_REDIRECT_URI, INSTAGRAM_SCOPES } from "./config";

export class MetaInstagramError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code?: string,
    public readonly subcode?: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

async function metaJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || payload?.error) {
    const error = payload?.error || {};
    throw new MetaInstagramError(
      String(error.message || `Meta HTTP ${response.status}`).slice(0, 500),
      response.status,
      error.code != null ? String(error.code) : undefined,
      error.error_subcode != null ? String(error.error_subcode) : undefined,
      response.status === 429 || response.status >= 500,
    );
  }
  return payload as T;
}

export function buildInstagramAuthorizationUrl(state: string): string {
  const { appId } = instagramEnv();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", INSTAGRAM_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeInstagramCode(code: string) {
  const { appId, appSecret } = instagramEnv();
  return metaJson<{ access_token: string; user_id: number; permissions?: string[] }>(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: INSTAGRAM_OAUTH_REDIRECT_URI,
        code,
      }),
    },
  );
}

export async function exchangeLongLivedInstagramToken(shortLivedToken: string) {
  const { appSecret } = instagramEnv();
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  return metaJson<{ access_token: string; token_type?: string; expires_in: number }>(url.toString());
}

export async function refreshLongLivedInstagramToken(accessToken: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{ access_token: string; token_type?: string; expires_in: number }>(url.toString());
}

export async function getInstagramProfile(accessToken: string) {
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://graph.instagram.com/${graphVersion}/me`);
  url.searchParams.set("fields", "id,user_id,username,name,profile_picture_url");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{
    id?: string;
    user_id?: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  }>(url.toString());
}

export async function subscribeInstagramWebhooks(accountId: string, accessToken: string) {
  const { graphVersion } = instagramEnv();
  const allFields = [
    "messages",
    "messaging_postbacks",
    "messaging_referral",
    "messaging_seen",
    "message_reactions",
  ];

  async function subscribe(fields: string[]) {
    const url = new URL(`https://graph.instagram.com/${graphVersion}/${accountId}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", fields.join(","));
    url.searchParams.set("access_token", accessToken);
    return metaJson<{ success: boolean }>(url.toString(), { method: "POST" });
  }

  try {
    await subscribe(allFields);
    return allFields;
  } catch (error) {
    await subscribe(["messages"]);
    return ["messages"];
  }
}

export async function getInstagramUserProfile(igsid: string, accessToken: string) {
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://graph.instagram.com/${graphVersion}/${igsid}`);
  url.searchParams.set("fields", "id,username,name,profile_pic");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{ id: string; username?: string; name?: string; profile_pic?: string }>(url.toString());
}

async function sendInstagramMessage(
  accountId: string,
  accessToken: string,
  recipientId: string,
  message: Record<string, unknown>,
) {
  const { graphVersion } = instagramEnv();
  return metaJson<{ message_id: string; recipient_id?: string }>(
    `https://graph.instagram.com/${graphVersion}/${accountId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipient: { id: recipientId }, message }),
    },
  );
}

export function sendInstagramText(
  accountId: string,
  accessToken: string,
  recipientId: string,
  text: string,
) {
  return sendInstagramMessage(accountId, accessToken, recipientId, { text });
}

export function sendInstagramAttachment(
  accountId: string,
  accessToken: string,
  recipientId: string,
  attachmentType: "image" | "video" | "audio" | "file",
  url: string,
) {
  return sendInstagramMessage(accountId, accessToken, recipientId, {
    attachment: { type: attachmentType, payload: { url, is_reusable: false } },
  });
}
