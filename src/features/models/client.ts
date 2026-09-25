import type { TaskweaverModelsApi } from '../../shared/model-api'

export function getModelsClient(): TaskweaverModelsApi | null {
  return window.taskweaver?.models ?? null
}

export function isModelsBridgeAvailable(): boolean {
  return Boolean(getModelsClient())
}
