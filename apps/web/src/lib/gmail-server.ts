/**
 * Server-side Gmail API helper.
 *
 * 背景: D1 に暗号化保存された refresh_token を復号し、
 * access_token を取得して Gmail API にアクセスする。
 * access_token はセッションにキャッシュし、有効期限5分前に自動リフレッシュする。
 * トークンはサーバー側でのみ使用し、クライアントに露出しない。
 */
import { getSession, updateSession } from "@tanstack/react-start/server";
import {
  getSessionConfig,
  getServerSecret,
  type AppSessionData,
} from "./session";
import { decrypt, encrypt, deriveKEK, importDEK } from "./crypto";
import {
  getDB,
  findLinkedAccountsByUserId,
  updateLinkedAccountToken,
  type LinkedAccountRow,
} from "./db";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * 指定アカウントの有効な access_token を取得する。
 *
 * 1. セッションのキャッシュを確認（有効期限5分以上）
 * 2. キャッシュなし/期限切れ → D1 から暗号化 refresh_token を取得
 * 3. DEK で復号 → Google Token Endpoint でリフレッシュ
 * 4. 新しい access_token をセッションにキャッシュ
 * 5. Google が新しい refresh_token を返した場合は D1 を更新
 */
export async function getAccessToken(
  accountId: string,
): Promise<string | null> {
  const session = await getSession<AppSessionData>(getSessionConfig());
  const { userId, dek: dekBase64 } = session.data;
  if (!userId || !dekBase64) return null;

  // 1. セッションキャッシュを確認
  const cached = session.data.accessTokenCache?.[accountId];
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return cached.accessToken;
  }

  // 2. D1 からアカウント情報を取得
  const db = getDB();
  const accounts = await findLinkedAccountsByUserId(db, userId);
  const account = accounts.find((a: LinkedAccountRow) => a.id === accountId);
  if (!account) return null;

  // 3. DEK で refresh_token を復号
  const dekBytes = base64ToUint8(dekBase64);
  const dekKey = await importDEK(dekBytes);
  const refreshToken = await decrypt(dekKey, {
    ciphertext: account.encrypted_refresh_token,
    iv: account.refresh_token_iv,
  });

  // 4. access_token をリフレッシュ
  const refreshed = await refreshGoogleToken(refreshToken);
  if (!refreshed) return null;

  // 5. セッションにキャッシュ
  await updateSession<AppSessionData>(getSessionConfig(), (prev) => ({
    ...prev,
    accessTokenCache: {
      ...prev.accessTokenCache,
      [accountId]: {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      },
    },
  }));

  // 6. Google が新しい refresh_token を返した場合は D1 を更新
  if (refreshed.newRefreshToken) {
    const encrypted = await encrypt(dekKey, refreshed.newRefreshToken);
    await updateLinkedAccountToken(db, accountId, {
      encrypted_refresh_token: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      token_scope: refreshed.scope,
    });
  }

  return refreshed.accessToken;
}

interface RefreshResult {
  accessToken: string;
  expiresAt: number;
  scope: string;
  /** Google がローテーションした場合のみ値が入る */
  newRefreshToken?: string;
}

async function refreshGoogleToken(
  refreshToken: string,
): Promise<RefreshResult | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    console.error(
      "Token refresh failed:",
      response.status,
      await response.text(),
    );
    return null;
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    // Google はトークンローテーション時のみ新しい refresh_token を返す
    newRefreshToken: data.refresh_token ?? undefined,
  };
}

/**
 * Gmail API に認証付きリクエストを送る。
 * アカウントが見つからないかトークンリフレッシュに失敗した場合は null を返す。
 */
export async function gmailFetch<T>(
  accountId: string,
  path: string,
): Promise<T | null> {
  const accessToken = await getAccessToken(accountId);
  if (!accessToken) return null;

  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`Gmail API error ${response.status} on ${path}`);
    return null;
  }

  return response.json();
}

// --- ユーティリティ ---

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
