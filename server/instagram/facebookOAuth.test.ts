import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFacebookAuthorizationUrl,
  discoverFacebookInstagramAssets,
  exchangeFacebookCode,
  exchangeLongLivedFacebookToken,
  sendInstagramText,
} from "./client";
import {
  INSTAGRAM_META_APP_ID,
  INSTAGRAM_OAUTH_REDIRECT_URI,
  INSTAGRAM_SCOPES,
} from "./config";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Instagram via Facebook Login for Business", () => {
  it("uses the authorized App, exact callback and minimum Messenger/Instagram scopes", () => {
    const url = new URL(buildFacebookAuthorizationUrl("signed-state"));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v26.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe(INSTAGRAM_META_APP_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(INSTAGRAM_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...INSTAGRAM_SCOPES]);
    expect(INSTAGRAM_SCOPES).toEqual(
      expect.arrayContaining([
        "pages_show_list",
        "pages_manage_metadata",
        "pages_messaging",
        "pages_read_engagement",
        "business_management",
        "instagram_basic",
        "instagram_manage_messages",
      ]),
    );
  });

  it("exchanges the Facebook code and short token only through graph.facebook.com", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: "short", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ access_token: "long", expires_in: 5_184_000 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeFacebookCode("oauth-code")).resolves.toMatchObject({ access_token: "short" });
    await expect(exchangeLongLivedFacebookToken("short")).resolves.toMatchObject({
      access_token: "long",
    });

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toContain("https://graph.facebook.com/v26.0/oauth/access_token");
    }
    expect(String(fetchMock.mock.calls[0][0])).toContain("code=oauth-code");
    expect(String(fetchMock.mock.calls[1][0])).toContain("grant_type=fb_exchange_token");
  });

  it("discovers every authorized Page but returns only those linked to Instagram Professional", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: [
            { id: "page-1", name: "Wedrop", access_token: "page-token-1" },
            { id: "page-2", name: "Sem Instagram", access_token: "page-token-2" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "page-1",
          name: "Wedrop",
          instagram_business_account: {
            id: "ig-1",
            username: "wedrop",
            name: "WeDrop",
            profile_picture_url: "https://cdn.example/avatar.jpg",
          },
        }),
      )
      .mockResolvedValueOnce(response({ id: "page-2", name: "Sem Instagram" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverFacebookInstagramAssets("long-user-token")).resolves.toEqual([
      {
        pageId: "page-1",
        pageName: "Wedrop",
        pageAccessToken: "page-token-1",
        instagramAccountId: "ig-1",
        instagramUsername: "wedrop",
        instagramName: "WeDrop",
        profilePictureUrl: "https://cdn.example/avatar.jpg",
      },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/accounts");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/page-1");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/page-2");
  });

  it("sends Instagram DMs through PAGE_ID/messages with RESPONSE and Page Access Token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ message_id: "mid-out" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInstagramText("page-1", "page-token", "igsid-1", "Olá")).resolves.toEqual({
      message_id: "mid-out",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v26.0/page-1/messages");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer page-token");
    expect(JSON.parse(String(init.body))).toEqual({
      recipient: { id: "igsid-1" },
      messaging_type: "RESPONSE",
      message: { text: "Olá" },
    });
  });
});
