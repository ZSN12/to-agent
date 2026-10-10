import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { hardenSecretPath } from "../lib/windows-secret-acl";

/** Apply best-effort owner-only permissions to an existing credential or state file. */
export function hardenExistingSecret(path: string): void {
  if (!existsSync(path)) return;
  try { chmodSync(path, 0o600); } catch { /* best-effort */ }
  if (process.platform === "win32") hardenSecretPath(path, { required: false });
}

/** Preserve a malformed config/auth file beside itself without changing its contents. */
export function backupInvalidConfig(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  const backupPath = `${configPath}.invalid-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    copyFileSync(configPath, backupPath);
    try { chmodSync(backupPath, 0o600); } catch { /* best-effort */ }
    return backupPath;
  } catch {
    return null;
  }
}
