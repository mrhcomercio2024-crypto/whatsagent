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

export type FacebookInstagramAsset = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramAccountId: string;
  instagramUsername?: string;
  instagramName?: string;
  profilePictureUrl?: string;
};

export function buildFacebookAuthorizationUrl(state: string): string {
  const { appId } = instagramEnv();
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", INSTAGRAM_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

export async function exchangeFacebookCode(code: string) {
  const { appId, appSecret } = instagramEnv();
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", INSTAGRAM_OAUTH_REDIRECT_URI);
  url.searchParams.set("code", code);
  return metaJson<{ access_token: string; token_type?: string; expires_in?: number }>(url.toString());
}

export async function exchangeLongLivedFacebookToken(shortLivedToken: string) {
  const { appId, appSecret, graphVersion } = instagramEnv();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  return metaJson<{ access_token: string; token_type?: string; expires_in: number }>(url.toString());
}

export async function discoverFacebookInstagramAssets(
  longLivedUserToken: string,
): Promise<FacebookInstagramAsset[]> {
  const { graphVersion } = instagramEnv();
  const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token,tasks");
  pagesUrl.searchParams.set("limit", "100");
  pagesUrl.searchParams.set("access_token", longLivedUserToken);
  const pages = await metaJson<{
    data?: Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }>;
  }>(pagesUrl.toString());
  const assets: FacebookInstagramAsset[] = [];
  for (const page of pages.data || []) {
    if (!page.id || !page.access_token) continue;
    const pageUrl = new URL(`https://graph.facebook.com/${graphVersion}/${page.id}`);
    pageUrl.searchParams.set(
      "fields",
      "id,name,instagram_business_account{id,username,name,profile_picture_url}",
    );
    pageUrl.searchParams.set("access_token", page.access_token);
    const pageWithInstagram = await metaJson<{
      id: string;
      name?: string;
      instagram_business_account?: {
        id: string;
        username?: string;
        name?: string;
        profile_picture_url?: string;
      };
    }>(pageUrl.toString());
    const instagram = pageWithInstagram.instagram_business_account;
    if (!instagram?.id) continue;
    assets.push({
      pageId: page.id,
      pageName: page.name || pageWithInstagram.name || page.id,
      pageAccessToken: page.access_token,
      instagramAccountId: instagram.id,
      instagramUsername: instagram.username,
      instagramName: instagram.name,
      profilePictureUrl: instagram.profile_picture_url,
    });
  }
  return assets;
}

export async function getInstagramProfile(instagramAccountId: string, accessToken: string) {
  const { graphVersion } = instagramEnv();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${instagramAccountId}`);
  url.searchParams.set("fields", "id,username,name,profile_picture_url");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{
    id?: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  }>(url.toString());
}

export async function subscribeInstagramWebhooks(pageId: string, accessToken: string) {
  const { graphVersion } = instagramEnv();
  const allFields = ["messages", "messaging_postbacks", "messaging_referrals"];

  async function subscribe(fields: string[]) {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps`);
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
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${igsid}`);
  url.searchParams.set("fields", "id,username,name,profile_pic");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{ id: string; username?: string; name?: string; profile_pic?: string }>(url.toString());
}

async function sendInstagramMessage(
  pageId: string,
  accessToken: string,
  recipientId: string,
  message: Record<string, unknown>,
) {
  const { graphVersion } = instagramEnv();
  return metaJson<{ message_id: string; recipient_id?: string }>(
    `https://graph.facebook.com/${graphVersion}/${pageId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message,
      }),
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
