import { isWildcardHostname } from "../codex/loopback-target";

/**
 * Render a bind hostname as a URL authority for loopback-facing CLI requests.
 * Wildcard binds are reached over IPv4 loopback; raw IPv6 literals need brackets.
 */
export function probeHostname(hostname: string | undefined): string {
  const trimmed = (hostname ?? "").trim();
  if (!trimmed || isWildcardHostname(trimmed)) {
    return "127.0.0.1";
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  return trimmed.includes(":") ? `[${trimmed}]` : trimmed;
}
import { isWildcardHostname } from "../codex/loopback-target";
