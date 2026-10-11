#!/usr/bin/env node
import assert from 'node:assert/strict'
import { activateUiVerifyMockModel, UI_VERIFY_MOCK_MODEL_KEY } from '../backend/bootstrap.mjs'

const base = {
  env: {
    TASKWEAVER_E2E: '1',
    TASKWEAVER_UI_VERIFY: '1',
    TASKWEAVER_UI_VERIFY_MOCK: '1',
    TASKWEAVER_USER_DATA: '/tmp/taskweaver-ui-verify/user-data',
    TASKWEAVER_HOME: '/tmp/taskweaver-ui-verify/user-data/runtime-home',
  },
  isPackaged: false,
  userDataPath: '/tmp/taskweaver-ui-verify/user-data',
}

let modelLoads = 0
const profile = { added: [], active: null }
const profileStore = {
  async listAddedModelKeys() { return profile.added },
  async addModel(key) { profile.added.push(key) },
  async setActiveModelKey(key) { profile.active = key },
}
const modelService = {
  async loadModelBundle() {
    modelLoads += 1
    return { catalog: { candidateModels: [{ key: UI_VERIFY_MOCK_MODEL_KEY, routeRegistered: true }] } }
  },
}

assert.deepEqual(await activateUiVerifyMockModel({
  ...base,
  env: { ...base.env, TASKWEAVER_UI_VERIFY: undefined },
  profileStore,
  modelService,
}), { enabled: false })
assert.equal(modelLoads, 0, 'fixture must not load a model outside the explicit UI verification mode')

await assert.rejects(
  activateUiVerifyMockModel({ ...base, isPackaged: true, profileStore, modelService }),
  /only in the unpackaged development app/,
)
await assert.rejects(
  activateUiVerifyMockModel({ ...base, userDataPath: '/tmp/real-user-data', profileStore, modelService }),
  /exact isolated Electron userData/,
)
await assert.rejects(
  activateUiVerifyMockModel({ ...base, env: { ...base.env, TASKWEAVER_HOME: '/Users/example/.taskweaver/runtime' }, profileStore, modelService }),
  /exact isolated TASKWEAVER_HOME/,
)
assert.deepEqual(await activateUiVerifyMockModel({
  ...base,
  env: { ...base.env, TASKWEAVER_UI_VERIFY_MOCK: undefined },
  profileStore,
  modelService,
}), { enabled: false }, 'mock provider activation must require the explicit local fixture flag')
assert.equal(modelLoads, 0)

const result = await activateUiVerifyMockModel({ ...base, profileStore, modelService })
assert.deepEqual(result, { enabled: true, modelKey: UI_VERIFY_MOCK_MODEL_KEY })
assert.deepEqual(profile.added, [UI_VERIFY_MOCK_MODEL_KEY])
assert.equal(profile.active, UI_VERIFY_MOCK_MODEL_KEY)

console.log('test-ui-verify-fixture: ok')
