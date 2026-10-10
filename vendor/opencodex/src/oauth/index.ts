/**
 * TaskWeaver bridge OAuth surface.
 *
 * The upstream OAuth coordinator covered every provider in the generic OpenCodex proxy. The
 * retained product bridge uses only Cursor and Google Antigravity, whose login and refresh flows
 * are isolated in their provider modules. Keep the bridge contract here small so importing a
 * token does not load the retired server, provider registry, or catalog stack.
 */
export {
  getValidAccessToken,
  OAuthAccountPausedError,
  OAuthLoginRequiredError,
  UnsupportedOAuthProviderError,
} from "./bridge-access";
