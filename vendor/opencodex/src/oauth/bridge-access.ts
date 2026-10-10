import { getAccountCredentialWithStatus, getAccountSet, createOAuthRefreshIntentLock, credentialGeneration, markAccountNeedsReauthIfGeneration, mergeAccountCredential } from "./store";
import type { OAuthCredentials } from "./types";
import { refreshCursorToken } from "./cursor";
import { refreshAntigravityToken } from "./google-antigravity";
import { REFRESH_SKEW_MS } from "./refresh-policy";

/** Stable errors consumed by TaskWeaver's provider bridge. */
export class OAuthLoginRequiredError extends Error {
  constructor(readonly provider: string) {
    super(`Not logged in to ${provider}. Run: ocx login ${provider}`);
    this.name = "OAuthLoginRequiredError";
  }
}

export class OAuthAccountPausedError extends Error {
  constructor() {
    super("OAuth account is paused. Resume it in account settings and retry.");
    this.name = "OAuthAccountPausedError";
  }
}

export class UnsupportedOAuthProviderError extends Error {
  constructor(readonly provider: string) {
    super(`Unsupported OAuth provider in TaskWeaver bridge: ${provider}`);
    this.name = "UnsupportedOAuthProviderError";
  }
}

const refreshers: Record<string, (refresh: string, signal?: AbortSignal) => Promise<OAuthCredentials>> = {
  cursor: refreshCursorToken,
  "google-antigravity": refreshAntigravityToken,
};
const refreshFlights = new Map<string, Promise<string>>();

function terminalRefreshFailure(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("invalid_grant")
    || message.includes("refresh_token_reused")
    || message.includes("revoked")
    || message.includes("access_denied")
    || message.includes("expired_token");
}

function retainCredentialMetadata(fresh: OAuthCredentials, previous: OAuthCredentials): OAuthCredentials {
  return {
    ...fresh,
    source: fresh.source === "local-cli" ? "local-cli"
      : previous.source === "local-cli" ? "oauth" : fresh.source ?? previous.source ?? "oauth",
    ...(fresh.projectId === undefined && previous.projectId ? { projectId: previous.projectId } : {}),
    ...(fresh.email === undefined && previous.email ? { email: previous.email } : {}),
    ...(fresh.accountId === undefined && previous.accountId ? { accountId: previous.accountId } : {}),
  };
}

async function refreshAccount(provider: string, accountId: string): Promise<string> {
  const key = `${provider}\0${accountId}`;
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const refresh = (async () => {
    const guard = await createOAuthRefreshIntentLock(provider, accountId).acquire();
    try {
      const row = getAccountCredentialWithStatus(provider, accountId);
      if (!row) throw new OAuthLoginRequiredError(provider);
      if (row.paused) throw new OAuthAccountPausedError();
      if (row.credential.expires > Date.now() + REFRESH_SKEW_MS) return row.credential.access;

      const definition = refreshers[provider];
      if (!definition) throw new UnsupportedOAuthProviderError(provider);
      const generation = credentialGeneration(row.credential);
      try {
        const updated = retainCredentialMetadata(
          await definition(row.credential.refresh),
          row.credential,
        );
        const result = await mergeAccountCredential(provider, accountId, updated, { expectedGeneration: generation });
        if (result.superseded) {
          if (result.stored.expires > Date.now() + REFRESH_SKEW_MS) return result.stored.access;
          throw new OAuthLoginRequiredError(provider);
        }
        return updated.access;
      } catch (error) {
        if (terminalRefreshFailure(error)) {
          await markAccountNeedsReauthIfGeneration(provider, accountId, generation);
          throw new OAuthLoginRequiredError(provider);
        }
        throw error;
      }
    } finally {
      guard.release();
    }
  })().finally(() => {
    if (refreshFlights.get(key) === refresh) refreshFlights.delete(key);
  });
  refreshFlights.set(key, refresh);
  return refresh;
}

/** Resolve the active Cursor or Antigravity bearer for the in-process bridge. */
export async function getValidAccessToken(provider: string): Promise<string> {
  if (!Object.hasOwn(refreshers, provider)) throw new UnsupportedOAuthProviderError(provider);
  const set = getAccountSet(provider);
  if (!set) throw new OAuthLoginRequiredError(provider);
  const account = set.accounts.find(candidate => candidate.id === set.activeAccountId);
  if (!account) throw new OAuthLoginRequiredError(provider);
  if (account.paused) throw new OAuthAccountPausedError();
  if (account.credential.expires > Date.now() + REFRESH_SKEW_MS) return account.credential.access;
  return refreshAccount(provider, account.id);
}
