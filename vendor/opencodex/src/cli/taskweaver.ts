#!/usr/bin/env bun
/**
 * TaskWeaver's deliberately small OpenCodex CLI surface.
 *
 * The upstream command dispatcher starts the proxy, desktop integrations and management
 * services. TaskWeaver owns those product surfaces elsewhere, so this entry retains only the
 * local model export and OAuth/status commands consumed by the application.
 */
import { lstatSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getConfigPath } from "../config/paths";
import { readRuntimePort } from "../config/process-state";
import { buildPiClientConfig, PI_EXPORT_OPTIONS } from "../clients/config-export/pi";
import type { ExportModel } from "../clients/config-export/contracts";
import type { PiGeneratedConfig } from "../clients/config-export/pi";
import { collapseAntigravityPublicModels, antigravityFamilyDisabled } from "../providers/antigravity-effort-families";
import { slugEquals } from "../providers/slug-codec";
import { configuredAdminToken } from "../lib/admin-secrets";
import { probeHostname } from "../lib/probe-hostname";
import { loadAuthStore, saveCredential } from "../oauth/store";
import { loginCursor } from "../oauth/cursor";
import { loginAntigravity } from "../oauth/google-antigravity";
import { openUrl } from "../lib/open-url";
import type { OAuthController, OAuthCredentials, ProviderAccountSet } from "../oauth/types";

const HELP = `TaskWeaver OpenCodex commands:
  ocx export --client pi --json
  ocx login <cursor|google-antigravity>
  ocx status`;

type PlainRecord = Record<string, unknown>;

interface RuntimeModelRow extends PlainRecord {
  provider?: string;
  id?: string;
  namespaced?: string;
  native?: boolean;
  disabled?: boolean;
  initialSelectionPending?: boolean;
  displayName?: string;
  displayNameSource?: string;
  exportMetadata?: PlainRecord;
  fastRowAvailable?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  maxInputTokens?: number;
  inputModalities?: string[];
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningSummaries?: boolean;
  antigravityEffortWireModelIds?: Partial<Record<"low" | "medium" | "high", string>>;
  catalogKind?: string;
  custom?: boolean;
}

interface MinimalConfig {
  providers: Record<string, PlainRecord>;
  disabledModels: string[];
  modelDiscovery?: PlainRecord;
  unauthenticatedLoopbackListener?: { enabled?: boolean; port?: number };
  fastRows?: boolean;
}

export interface TaskWeaverCliDeps {
  fetchImpl?: typeof fetch;
  loginCursorImpl?: typeof loginCursor;
  loginAntigravityImpl?: typeof loginAntigravity;
  saveCredentialImpl?: typeof saveCredential;
  openUrlImpl?: typeof openUrl;
  loadAuthStoreImpl?: typeof loadAuthStore;
}

function isRecord(value: unknown): value is PlainRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function loadMinimalConfig(): MinimalConfig {
  const path = getConfigPath();
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { providers: {}, disabledModels: [] };
    }
    throw new Error("Could not read the OpenCodex config safely.");
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) {
    throw new Error("The OpenCodex config is not a regular file or exceeds the 4 MiB read limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("The OpenCodex config is invalid JSON; refusing to export an incomplete model list.");
  }
  if (!isRecord(parsed)) throw new Error("The OpenCodex config has an unexpected shape.");
  const rawProviders = isRecord(parsed.providers) ? parsed.providers : {};
  const providers: Record<string, PlainRecord> = {};
  for (const [name, provider] of Object.entries(rawProviders)) {
    if (isRecord(provider)) providers[name] = provider;
  }
  const disabledModels = Array.isArray(parsed.disabledModels)
    ? parsed.disabledModels.filter((value): value is string => typeof value === "string")
    : [];
  return {
    providers,
    disabledModels,
    ...(isRecord(parsed.modelDiscovery) ? { modelDiscovery: parsed.modelDiscovery } : {}),
    ...(isRecord(parsed.unauthenticatedLoopbackListener)
      ? { unauthenticatedLoopbackListener: parsed.unauthenticatedLoopbackListener as MinimalConfig["unauthenticatedLoopbackListener"] }
      : {}),
    ...(typeof parsed.fastRows === "boolean" ? { fastRows: parsed.fastRows } : {}),
  };
}

function isSelected(row: RuntimeModelRow, providerConfig: PlainRecord | undefined): boolean {
  if (providerConfig?.disabled === true) return false;
  const selected = providerConfig?.selectedModels;
  if (!Array.isArray(selected) || selected.length === 0) return true;
  const provider = row.provider;
  const id = row.id;
  if (!provider || !id) return false;
  return selected.some(value => typeof value === "string"
    && (value === row.namespaced || value === id || slugEquals(value, provider, id)));
}

/** Map the management API rows using only TaskWeaver's retained catalog contract. */
export function exportModelsFromProxyRows(
  inputRows: readonly RuntimeModelRow[],
  config: MinimalConfig,
): ExportModel[] {
  const completeRows = inputRows.filter(
    (row): row is RuntimeModelRow & { provider: string; id: string } =>
      typeof row.provider === "string" && typeof row.id === "string",
  );
  const rows = collapseAntigravityPublicModels(completeRows);
  const nativeCodexDirect = config.providers.openai?.codexAccountMode === "direct";
  const seen = new Set<string>();
  const result: ExportModel[] = [];
  for (const row of rows) {
    const namespaced = row.namespaced?.trim();
    if (!namespaced || row.disabled === true || row.initialSelectionPending === true) continue;
    if (nativeCodexDirect && row.native === true) continue;
    const provider = row.provider;
    const id = row.id;
    const providerConfig = provider ? config.providers[provider] : undefined;
    if (!provider || !id || !isSelected(row, providerConfig)) continue;
    if (antigravityFamilyDisabled(config, row, rows)) continue;
    if (seen.has(namespaced)) continue;
    seen.add(namespaced);

    const effective = isRecord(row.exportMetadata) ? row.exportMetadata : undefined;
    const maxTokens = effective?.maxTokens ?? row.maxOutputTokens;
    const maxInputTokens = effective?.maxInputTokens ?? row.maxInputTokens;
    const inputModalities = effective?.inputModalities ?? row.inputModalities;
    const reasoningEfforts = effective?.reasoningEfforts ?? row.reasoningEfforts;
    const defaultEffort = effective !== undefined ? effective.defaultReasoningEffort : row.defaultReasoningEffort;
    const supportsTools = effective?.supportsTools ?? row.supportsTools;
    const supportsReasoning = effective?.supportsReasoning ?? row.supportsReasoning;
    const supportsReasoningSummaries = effective?.supportsReasoningSummaries ?? row.supportsReasoningSummaries;
    const model: ExportModel = {
      namespaced,
      provider,
      id,
    };
    if (row.native === true) model.native = true;
    if (row.fastRowAvailable !== undefined) model.fastRowAvailable = row.fastRowAvailable;
    if (row.displayNameSource !== "fallback" && row.displayName) model.displayName = row.displayName;
    if (typeof effective?.contextWindow === "number") model.contextWindow = effective.contextWindow;
    else if (typeof row.contextWindow === "number") model.contextWindow = row.contextWindow;
    if (typeof maxTokens === "number") model.maxTokens = maxTokens;
    if (typeof maxInputTokens === "number") model.maxInputTokens = maxInputTokens;
    if (Array.isArray(inputModalities)) model.inputModalities = inputModalities.filter((value): value is string => typeof value === "string");
    if (Array.isArray(reasoningEfforts)) model.reasoningEfforts = reasoningEfforts.filter((value): value is string => typeof value === "string");
    if (typeof defaultEffort === "string" && defaultEffort.length > 0) model.defaultReasoningEffort = defaultEffort;
    if (typeof supportsTools === "boolean") model.supportsTools = supportsTools;
    if (typeof supportsReasoning === "boolean") model.supportsReasoning = supportsReasoning;
    if (typeof supportsReasoningSummaries === "boolean") model.supportsReasoningSummaries = supportsReasoningSummaries;
    result.push(model);
  }
  return result;
}

function isOpenCodexHealth(value: unknown, pid: number, port: number): boolean {
  if (!isRecord(value)) return false;
  const identity = value.service === "opencodex"
    || (value.service === undefined && value.status === "ok"
      && typeof value.version === "string" && typeof value.uptime === "number");
  return identity
    && (value.pid === undefined || value.pid === pid)
    && (value.port === undefined || value.port === port);
}

async function fetchProxyModels(fetchImpl: typeof fetch = fetch): Promise<{ rows: RuntimeModelRow[]; baseUrl: string }> {
  const runtime = readRuntimePort();
  if (!runtime) throw new Error("No OpenCodex runtime is recorded. Start the TaskWeaver host first.");
  const origin = `http://${probeHostname(runtime.hostname)}:${runtime.port}`;
  const healthResponse = await fetchImpl(`${origin}/healthz`, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  const health = await healthResponse.json().catch(() => null) as unknown;
  if (healthResponse.status !== 200 || !isOpenCodexHealth(health, runtime.pid, runtime.port)) {
    throw new Error("The recorded local runtime failed its OpenCodex identity check; no credentials were sent.");
  }
  const token = configuredAdminToken();
  if (!token) throw new Error("The OpenCodex management token is unavailable; cannot read the model catalog.");
  const modelsResponse = await fetchImpl(`${origin}/api/models`, {
    headers: { Accept: "application/json", "X-OpenCodex-API-Key": token },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const body = await modelsResponse.json().catch(() => null) as unknown;
  if (!modelsResponse.ok) throw new Error(`The OpenCodex model catalog request failed (HTTP ${modelsResponse.status}).`);
  if (!Array.isArray(body)) throw new Error("The OpenCodex model catalog returned an unexpected payload.");

  const config = loadMinimalConfig();
  const listener = config.unauthenticatedLoopbackListener;
  const basePort = listener?.enabled && Number.isInteger(listener.port) ? listener.port! : runtime.port;
  const hostname = listener?.enabled ? "127.0.0.1" : probeHostname(runtime.hostname);
  const baseUrl = `http://${hostname}:${basePort}/v1`;
  return { rows: body as RuntimeModelRow[], baseUrl };
}

function activeAccount(set: ProviderAccountSet | undefined) {
  return set?.accounts.find(account => account.id === set.activeAccountId);
}

export function providerLoginStatus(store: ReturnType<typeof loadAuthStore>): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const provider of ["cursor", "google-antigravity"]) {
    const account = activeAccount(store[provider]);
    status[provider] = Boolean(account?.credential.access && !account.needsReauth && !account.paused);
  }
  return status;
}

function printStatus(loadStore: typeof loadAuthStore = loadAuthStore): void {
  const status = providerLoginStatus(loadStore());
  for (const provider of ["cursor", "google-antigravity"]) {
    console.log(`${provider.padEnd(20)} ${status[provider] ? "✓ logged in" : "✗ not logged in"}`);
  }
}

async function login(provider: string, deps: TaskWeaverCliDeps = {}): Promise<void> {
  if (provider !== "cursor" && provider !== "google-antigravity") {
    throw new Error("TaskWeaver supports OAuth login for cursor and google-antigravity.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("Login cancelled"));
  process.once("SIGINT", abort);
  let prompt;
  if (provider === "google-antigravity" && stdin.isTTY) {
    prompt = createInterface({ input: stdin, output: stdout });
  }
  const oauthController: OAuthController = {
    signal: controller.signal,
    onAuth: ({ url, instructions }) => {
      if (process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL === "1") {
        // The desktop Host validates and opens this provider-generated URL via
        // its platform shell capability. Keep this marker private to the
        // parent process instead of invoking a second, detached OS launcher.
        console.log(`TASKWEAVER_AUTH_URL ${url}`);
      } else {
        console.log(`Open this URL to sign in:\n${url}`);
        if (instructions) console.log(instructions);
        void (deps.openUrlImpl ?? openUrl)(url).then(result => {
          if (result.status === "failed") console.error("Could not open a browser; use the URL printed above.");
        });
      }
    },
    onProgress: message => {
      if (process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL !== "1") console.error(message);
    },
    ...(prompt ? { onManualCodeInput: async () => prompt!.question("Paste the authorization redirect URL or code: ") } : {}),
  };
  try {
    const credential: OAuthCredentials = provider === "cursor"
      ? await (deps.loginCursorImpl ?? loginCursor)(oauthController)
      : await (deps.loginAntigravityImpl ?? loginAntigravity)(oauthController);
    await (deps.saveCredentialImpl ?? saveCredential)(provider, credential);
    if (process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL !== "1") console.log(`Logged in to ${provider}.`);
  } finally {
    process.removeListener("SIGINT", abort);
    prompt?.close();
  }
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

async function exportPi(argv: string[], deps: TaskWeaverCliDeps = {}): Promise<void> {
  const args = [...argv];
  const clientIndex = args.indexOf("--client");
  if (clientIndex === -1 || args[clientIndex + 1] !== "pi") {
    throw new Error("Usage: ocx export --client pi --json");
  }
  args.splice(clientIndex, 2);
  const json = takeFlag(args, "--json");
  if (args.length > 0) throw new Error(`Unsupported export option: ${args[0]}`);
  if (!json) throw new Error("TaskWeaver's catalog export requires --json.");
  const { rows, baseUrl } = await fetchProxyModels(deps.fetchImpl);
  const config = loadMinimalConfig();
  const models = exportModelsFromProxyRows(rows, config);
  const document: PiGeneratedConfig = buildPiClientConfig({ baseUrl, models }, PI_EXPORT_OPTIONS);
  console.log(JSON.stringify(document, null, 2));
}

export async function runTaskWeaverCli(argv: string[], deps: TaskWeaverCliDeps = {}): Promise<number> {
  const args = [...argv];
  if (args[0]?.startsWith("--ocx-internal-launch-proof=")) args.shift();
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
    return 0;
  }
  if (command === "status" && rest.length === 0) {
    printStatus(deps.loadAuthStoreImpl);
    return 0;
  }
  if (command === "login" && rest.length >= 1) {
    await login(rest[0]!, deps);
    return 0;
  }
  if (command === "export") {
    await exportPi(rest, deps);
    return 0;
  }
  console.error(HELP);
  return 2;
}

if (import.meta.main) {
  runTaskWeaverCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
