export const INSTAGRAM_META_APP_ID = "2533423037090142";
export const INSTAGRAM_CALLBACK_URL = "https://agentedozap.com/webhooks/meta/instagram";
export const INSTAGRAM_OAUTH_REDIRECT_URI = "https://agentedozap.com/api/instagram/oauth/callback";
export const INSTAGRAM_ADMIN_REDIRECT = "https://agentedozap.com/instagram";
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

export function instagramEnv() {
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  const verifyToken = process.env.META_INSTAGRAM_VERIFY_TOKEN || "";
  const graphVersion = process.env.META_GRAPH_API_VERSION || "";

  if (appId !== INSTAGRAM_META_APP_ID) throw new Error("META_APP_ID_INVALID");
  if (appSecret.length < 16) throw new Error("META_APP_SECRET_MISSING");
  if (verifyToken.length < 32) throw new Error("META_INSTAGRAM_VERIFY_TOKEN_INVALID");
  if (!/^v\d+\.0$/.test(graphVersion)) throw new Error("META_GRAPH_API_VERSION_INVALID");

  return { appId, appSecret, verifyToken, graphVersion };
}
