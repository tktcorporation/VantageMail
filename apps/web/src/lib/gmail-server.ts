/**
 * Server-side Gmail API helper.
 *
 * Reads OAuth tokens from the encrypted session, refreshes if expired,
 * and provides authenticated access to the Gmail API.
 * Tokens never leave the server — only converted Thread/Message data is returned to the client.
 */
import { getSession, updateSession } from "@tanstack/react-start/server";
import {
  getSessionConfig,
  type AppSessionData,
  type StoredAccount,
} from "./session";
import type { OAuthTokens } from "@vantagemail/core";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Get a valid access token for the given account.
 * Refreshes the token if it's expired or about to expire (within 5 minutes).
 * Updates the session with the new token on refresh.
 */
export async function getAccessToken(accountId: string): Promise<string | null> {
  const session = await getSession<AppSessionData>(getSessionConfig());
  const stored = (session.data.accounts ?? []).find(
    (sa: StoredAccount) => sa.account.id === accountId,
  );
  if (!stored) return null;

  const { tokens } = stored;

  // Token still valid (more than 5 minutes remaining)
  if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) {
    return tokens.accessToken;
  }

  // Refresh the token
  const refreshed = await refreshToken(tokens.refreshToken);
  if (!refreshed) return null;

  // Update session with new tokens
  await updateSession<AppSessionData>(getSessionConfig(), (prev) => {
    const accounts = (prev.accounts ?? []).map((sa: StoredAccount) => {
      if (sa.account.id !== accountId) return sa;
      return { ...sa, tokens: refreshed };
    });
    return { ...prev, accounts };
  });

  return refreshed.accessToken;
}

async function refreshToken(refreshTokenValue: string): Promise<OAuthTokens | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    console.error("Token refresh failed:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshTokenValue,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Make an authenticated request to the Gmail API.
 * Returns null if the account is not found or token refresh fails.
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
