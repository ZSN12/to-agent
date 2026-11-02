import path from 'node:path'

export const UI_VERIFY_MOCK_MODEL_KEY = 'bridge-composer/cursor/composer-2.5-fast'

export function uiVerifyMockRequested(env = process.env) {
  return env.TASKWEAVER_E2E === '1'
    && env.TASKWEAVER_UI_VERIFY === '1'
    && env.TASKWEAVER_UI_VERIFY_MOCK === '1'
}

export function assertUiVerifyMockIsolation({ env = process.env, isPackaged = false, userDataPath }) {
  if (isPackaged || env.TASKWEAVER_PACKAGED === '1' || env.TASKWEAVER_PACKAGED === 'true') {
    throw new Error('UI verification mock model is available only in the unpackaged development app')
  }
  const isolatedUserData = env.TASKWEAVER_USER_DATA
  if (typeof isolatedUserData !== 'string' || !path.isAbsolute(isolatedUserData)
    || !userDataPath || path.resolve(isolatedUserData) !== path.resolve(userDataPath)) {
    throw new Error('UI verification mock model requires its exact isolated Electron userData directory')
  }
  const isolatedRuntimeHome = path.join(path.resolve(userDataPath), 'runtime-home')
  if (typeof env.TASKWEAVER_HOME !== 'string' || !path.isAbsolute(env.TASKWEAVER_HOME)
    || path.resolve(env.TASKWEAVER_HOME) !== isolatedRuntimeHome) {
    throw new Error('UI verification mock model requires its exact isolated TASKWEAVER_HOME directory')
  }
}

export function isUiVerifyMockIsolated({ env = process.env, isPackaged = false, userDataPath }) {
  if (!uiVerifyMockRequested(env)) return false
  try {
    assertUiVerifyMockIsolation({ env, isPackaged, userDataPath })
    return true
  } catch {
    return false
  }
}
