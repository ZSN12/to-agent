import type { ExportContext, PiModelEntry } from "./contracts";
import { LOOPBACK_API_KEY_PLACEHOLDER, OPENCODE_PROVIDER_ID, PI_API_DIALECT } from "./constants";
import {
  authoritativeContextWindow,
  exportModelLabel,
  inputModalitiesForClient,
  normalizeExportModels,
  outputBudgetFor,
} from "./model-metadata";

export interface PiProviderBlock {
  baseUrl: string;
  api: string;
  apiKey: string;
  compat?: PiProviderCompat;
  models: PiModelEntry[];
}

/** The subset of Pi's documented provider compatibility settings this exporter uses. */
export interface PiProviderCompat {
  sendSessionAffinityHeaders?: boolean;
  supportsDeveloperRole?: boolean;
}

export interface PiExportOptions {
  sendSessionAffinityHeaders?: boolean;
  /** Send system prompts as `system`, avoiding unsupported `developer` roles upstream. */
  foldDeveloperRole?: boolean;
}

export interface PiGeneratedConfig {
  providers: Record<string, PiProviderBlock>;
}

/** Options shared by Pi and its OMP derivative in the product export path. */
export const PI_EXPORT_OPTIONS: PiExportOptions = {
  sendSessionAffinityHeaders: true,
  foldDeveloperRole: true,
};

/** Build Pi's standalone custom-provider config from the visible proxy catalog. */
export function buildPiClientConfig(
  ctx: ExportContext,
  options: PiExportOptions = {},
): PiGeneratedConfig {
  const models: PiModelEntry[] = [];
  for (const model of normalizeExportModels(ctx.models)) {
    const input = inputModalitiesForClient("pi", model.inputModalities);
    if (input === null) continue;
    const entry: PiModelEntry = {
      id: model.namespaced,
      name: exportModelLabel(model),
      input,
    };
    if (Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0) {
      entry.reasoning = true;
      const efforts = model.reasoningEfforts;
      entry.thinkingLevelMap = {
        off: efforts.includes("none") ? "none" : null,
        minimal: efforts.includes("minimal") ? "minimal" : null,
        low: efforts.includes("low") ? "low" : null,
        medium: efforts.includes("medium") ? "medium" : null,
        high: efforts.includes("high") ? "high" : null,
        xhigh: efforts.includes("xhigh") ? "xhigh" : null,
        max: efforts.includes("max") ? "max" : efforts.includes("ultra") ? "ultra" : null,
      };
    }
    const context = authoritativeContextWindow(model.contextWindow);
    if (context !== undefined) {
      entry.contextWindow = context;
      entry.maxTokens = outputBudgetFor(context, model);
    }
    models.push(entry);
  }

  const compat: PiProviderCompat = {
    ...(options.sendSessionAffinityHeaders ? { sendSessionAffinityHeaders: true } : {}),
    ...(options.foldDeveloperRole ? { supportsDeveloperRole: false } : {}),
  };
  return {
    providers: {
      [OPENCODE_PROVIDER_ID]: {
        baseUrl: ctx.baseUrl,
        api: PI_API_DIALECT,
        apiKey: LOOPBACK_API_KEY_PLACEHOLDER,
        ...(Object.keys(compat).length > 0 ? { compat } : {}),
        models,
      },
    },
  };
}
