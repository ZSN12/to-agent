import type { ModelAddItemResult, ModelAddItemResultListener } from '../../shared/model-api'

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : typeof error === 'string' && error
      ? error
      : '添加模型时发生未知错误'
}

/**
 * Attempt every key in order, reporting each outcome as soon as it settles.
 * A failure for one model must not prevent later models from being added.
 */
export async function runSequentialModelAdds(
  modelKeys: string[],
  addModel: (modelKey: string) => Promise<void>,
  onItemResult?: ModelAddItemResultListener,
): Promise<ModelAddItemResult[]> {
  const results: ModelAddItemResult[] = []
  for (const modelKey of modelKeys) {
    let result: ModelAddItemResult
    try {
      await addModel(modelKey)
      result = { modelKey, ok: true }
    } catch (error) {
      result = { modelKey, ok: false, error: errorMessage(error) }
    }
    results.push(result)
    onItemResult?.(result)
  }
  return results
}
