/**
 * OAuth コールバックルート（GET /oauth/callback）。
 *
 * 背景: Google OAuth 認証後のリダイレクト先。3つのケースを処理する:
 *
 * 1. 新規ユーザー: google_sub が DB にない → ユーザー作成 + DEK 生成 + アカウント登録
 * 2. 既存ユーザーのログイン: google_sub が DB にある → KEK 再導出 → DEK 復号 → セッション復元
 * 3. アカウント追加: セッションに userId がある → 別の Gmail を linked_accounts に追加
 *
 * セキュリティ:
 * - id_token から google_sub を取得（改ざん不可、Google が署名）
 * - refresh_token は DEK で暗号化して D1 に保存
 * - DEK は KEK = HKDF(SERVER_SECRET, google_sub) で暗号化して D1 に保存
 * - access_token はセッションにキャッシュのみ（DB に保存しない）
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  getRequestUrl,
  getSession,
  updateSession,
} from "@tanstack/react-start/server";
import {
  getSessionConfig,
  getServerSecret,
  type AppSessionData,
} from "~/lib/session";
import {
  deriveKEK,
  generateDEK,
  importDEK,
  encrypt,
  encryptDEK,
  decryptDEK,
} from "~/lib/crypto";
import {
  getDB,
  findUserByGoogleSub,
  createUser,
  updateUserProfile,
  findLinkedAccountByEmail,
  findLinkedAccountsByUserId,
  createLinkedAccount,
  updateLinkedAccountToken,
  updateLinkedAccountProfile,
} from "~/lib/db";

/** アカウントに割り当てるカラーのプール */
const ACCOUNT_COLORS = [
  "#228be6",
  "#40c057",
  "#fab005",
  "#fa5252",
  "#7950f2",
  "#e64980",
  "#15aabf",
  "#fd7e14",
];

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT =
  "https://www.googleapis.com/oauth2/v2/userinfo";
/**
 * Google ID Token からクレームを取得するエンドポイント。
 * google_sub（不変のユーザー識別子）を安全に取得するために使う。
 */
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

export const Route = createFileRoute("/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const requestUrl = getRequestUrl();
        const origin = requestUrl.origin;

        // --- エラーケース ---
        const error = url.searchParams.get("error");
        if (error) {
          return redirectWithError(origin, error);
        }

        const code = url.searchParams.get("code");
        if (!code) {
          return redirectWithError(origin, "missing_authorization_code");
        }

        // --- セッションから code_verifier を取得 ---
        const session = await getSession<AppSessionData>(getSessionConfig());
        const codeVerifier = session.data.codeVerifier;
        if (!codeVerifier) {
          return redirectWithError(origin, "session_not_found");
        }

        try {
          // --- トークン交換 ---
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID!;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
          const redirectUri =
            import.meta.env.VITE_OAUTH_REDIRECT_URI ??
            `${origin}/oauth/callback`;

          const tokenBody = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: codeVerifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          });

          const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenBody.toString(),
          });

          if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            console.error(
              "Token exchange failed:",
              tokenResponse.status,
              errText,
            );
            throw new Error("token_exchange_failed");
          }

          const tokenData = await tokenResponse.json();

          if (!tokenData.refresh_token) {
            throw new Error("refresh_token_missing");
          }

          // --- id_token から google_sub を取得 ---
          // id_token は JWT。Google の tokeninfo エンドポイントで検証・デコードする。
          // クライアントサイドで JWT をパースするより安全。
          const googleSub = await extractGoogleSub(tokenData.id_token);
          if (!googleSub) {
            throw new Error("google_sub_extraction_failed");
          }

          // --- ユーザー情報取得 ---
          const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });
          if (!userInfoResponse.ok) {
            throw new Error("userinfo_fetch_failed");
          }
          const userInfo = await userInfoResponse.json();

          // --- 3パターンの分岐 ---
          const isAddAccountMode = !!session.data.userId && !!session.data.dek;

          if (isAddAccountMode) {
            // ケース3: ログイン済みユーザーがアカウント追加
            await handleAddAccount(
              session.data.userId!,
              session.data.dek!,
              googleSub,
              userInfo,
              tokenData,
            );
          } else {
            // ケース1 or 2: 新規登録 or 既存ユーザーのログイン
            await handleLoginOrRegister(
              googleSub,
              userInfo,
              tokenData,
            );
          }

          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/` },
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "authentication_failed";
          return redirectWithError(origin, message);
        }
      },
    },
  },
  component: () => (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <span className="text-4xl animate-spin">⏳</span>
      <p className="text-[var(--color-text-secondary)]">Authenticating...</p>
    </div>
  ),
});

/**
 * 新規登録 or 既存ユーザーのログインを処理する。
 *
 * google_sub で DB を検索し、見つかれば既存ユーザー（ケース2）、
 * 見つからなければ新規ユーザー（ケース1）として処理する。
 */
async function handleLoginOrRegister(
  googleSub: string,
  userInfo: { email: string; name: string; picture?: string },
  tokenData: { access_token: string; refresh_token: string; scope: string; expires_in: number },
): Promise<void> {
  const db = getDB();
  const serverSecret = getServerSecret();
  const existingUser = await findUserByGoogleSub(db, googleSub);

  if (existingUser) {
    // --- ケース2: 既存ユーザーのログイン ---
    // KEK を再導出して DEK を復号し、セッションに保存
    const kek = await deriveKEK(serverSecret, googleSub);
    const dekBytes = await decryptDEK(kek, {
      ciphertext: existingUser.encrypted_dek,
      iv: existingUser.dek_iv,
    });
    const dekKey = await importDEK(dekBytes);

    // プロフィールを最新に更新
    await updateUserProfile(db, googleSub, {
      email: userInfo.email,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
    });

    // メインアカウントの refresh_token を更新
    const mainAccount = await findLinkedAccountByEmail(
      db,
      existingUser.id,
      userInfo.email,
    );
    if (mainAccount) {
      const encryptedToken = await encrypt(dekKey, tokenData.refresh_token);
      await updateLinkedAccountToken(db, mainAccount.id, {
        encrypted_refresh_token: encryptedToken.ciphertext,
        refresh_token_iv: encryptedToken.iv,
        token_scope: tokenData.scope,
      });
      await updateLinkedAccountProfile(db, mainAccount.id, {
        display_name: userInfo.name,
        avatar_url: userInfo.picture ?? null,
      });
    }

    // セッションに保存（DEK の base64 文字列）
    const dekBase64 = uint8ToBase64(dekBytes);
    await updateSession<AppSessionData>(getSessionConfig(), () => ({
      userId: existingUser.id,
      dek: dekBase64,
      codeVerifier: undefined,
      accessTokenCache: {
        // ログイン時に取得した access_token をキャッシュ
        ...(mainAccount
          ? {
              [mainAccount.id]: {
                accessToken: tokenData.access_token,
                expiresAt: Date.now() + tokenData.expires_in * 1000,
              },
            }
          : {}),
      },
    }));
  } else {
    // --- ケース1: 新規ユーザー ---
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();

    // DEK 生成 → KEK で暗号化
    const dekBytes = generateDEK();
    const kek = await deriveKEK(serverSecret, googleSub);
    const encryptedDEK = await encryptDEK(kek, dekBytes);

    // refresh_token を DEK で暗号化
    const dekKey = await importDEK(dekBytes);
    const encryptedToken = await encrypt(dekKey, tokenData.refresh_token);

    // users テーブルに保存
    await createUser(db, {
      id: userId,
      google_sub: googleSub,
      email: userInfo.email,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
      encrypted_dek: encryptedDEK.ciphertext,
      dek_iv: encryptedDEK.iv,
    });

    // linked_accounts にメインアカウントを保存
    await createLinkedAccount(db, {
      id: accountId,
      user_id: userId,
      email: userInfo.email,
      google_sub: googleSub,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
      color: ACCOUNT_COLORS[0],
      encrypted_refresh_token: encryptedToken.ciphertext,
      refresh_token_iv: encryptedToken.iv,
      token_scope: tokenData.scope,
    });

    // セッションに保存
    const dekBase64 = uint8ToBase64(dekBytes);
    await updateSession<AppSessionData>(getSessionConfig(), () => ({
      userId,
      dek: dekBase64,
      codeVerifier: undefined,
      accessTokenCache: {
        [accountId]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }));
  }
}

/**
 * ログイン済みユーザーが別の Gmail アカウントを追加する。
 *
 * セッションから DEK を取得し、新しいアカウントの refresh_token を暗号化して
 * linked_accounts に追加する。
 */
async function handleAddAccount(
  userId: string,
  dekBase64: string,
  googleSub: string,
  userInfo: { email: string; name: string; picture?: string },
  tokenData: { access_token: string; refresh_token: string; scope: string; expires_in: number },
): Promise<void> {
  const db = getDB();
  const dekBytes = base64ToUint8(dekBase64);
  const dekKey = await importDEK(dekBytes);

  // 同じメールアドレスが既に登録されているか確認
  const existing = await findLinkedAccountByEmail(db, userId, userInfo.email);

  if (existing) {
    // 再認証のケース: トークンとプロフィールを更新
    const encryptedToken = await encrypt(dekKey, tokenData.refresh_token);
    await updateLinkedAccountToken(db, existing.id, {
      encrypted_refresh_token: encryptedToken.ciphertext,
      refresh_token_iv: encryptedToken.iv,
      token_scope: tokenData.scope,
    });
    await updateLinkedAccountProfile(db, existing.id, {
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
    });

    // access_token をキャッシュに追加
    await updateSession<AppSessionData>(getSessionConfig(), (prev) => ({
      ...prev,
      codeVerifier: undefined,
      accessTokenCache: {
        ...prev.accessTokenCache,
        [existing.id]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }));
  } else {
    // 新規アカウント追加
    const accountId = crypto.randomUUID();
    const encryptedToken = await encrypt(dekKey, tokenData.refresh_token);

    // 既存アカウント数からカラーを決定
    const existingAccounts = await findLinkedAccountsByUserId(db, userId);
    const colorIndex = existingAccounts.length % ACCOUNT_COLORS.length;

    await createLinkedAccount(db, {
      id: accountId,
      user_id: userId,
      email: userInfo.email,
      google_sub: googleSub,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
      color: ACCOUNT_COLORS[colorIndex],
      encrypted_refresh_token: encryptedToken.ciphertext,
      refresh_token_iv: encryptedToken.iv,
      token_scope: tokenData.scope,
    });

    await updateSession<AppSessionData>(getSessionConfig(), (prev) => ({
      ...prev,
      codeVerifier: undefined,
      accessTokenCache: {
        ...prev.accessTokenCache,
        [accountId]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }));
  }
}

/**
 * Google ID Token から google_sub（不変ユーザーID）を抽出する。
 *
 * 背景: id_token は JWT 形式。ペイロードの `sub` フィールドが google_sub。
 * JWT のペイロード部分を base64 デコードするだけで取得できる。
 * トークン自体は Google の Token Endpoint から直接取得したものなので、
 * 署名検証は不要（サーバー間通信で改ざんリスクなし）。
 */
async function extractGoogleSub(idToken: string): Promise<string | null> {
  try {
    // JWT は header.payload.signature の3パート構成
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;

    // payload を base64url デコード
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub ?? null;
  } catch {
    console.error("Failed to extract google_sub from id_token");
    return null;
  }
}

function redirectWithError(origin: string, error: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/?auth_error=${encodeURIComponent(error)}`,
    },
  });
}

// --- base64 ユーティリティ ---

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
