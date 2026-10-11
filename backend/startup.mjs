import { createAppBootstrap } from './bootstrap.mjs'
import {
  createZHostManager,
  resolveHostNodeExecutable,
  resolveTaskWeaverRuntimeRoot,
} from './agent/z-host/index.mjs'
import { resolveTaskWeaverOpenCodexRoot } from './opencodex-package-root.mjs'
import { setOcxRuntimeContext } from './opencodex-binary.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

/**
 * Create the process-wide Host/bootstrap coordinator before composing services.
 * Host integrations and model services are supplied by compose as soon as their
 * dependencies exist, allowing Host startup to overlap the rest of composition.
 */
export function createBackendStartup({
  app,
  environment = process.env,
  resourcesPath = process.resourcesPath,
} = {}) {
  if (!app?.getAppPath || !app?.getPath) {
    throw new TypeError('createBackendStartup requires an app adapter with getAppPath() and getPath()')
  }

  const appPath = app.getAppPath()
  const userData = app.getPath('userData')
  const isPackaged = app.isPackaged === true
  const runtimeRoot = resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath,
    isPackaged,
    env: environment,
  })
  const hostNode = resolveHostNodeExecutable({ env: environment, resourcesPath, isPackaged })
  if (hostNode.source !== 'bundled') {
    console.info(`[TaskWeaver] Z Host 使用 ${hostNode.source} Node：${hostNode.executable}`)
  }
  setOcxRuntimeContext({ appPath, resourcesPath, isPackaged })

  const opencodexPackageRoot = resolveTaskWeaverOpenCodexRoot(appPath) ?? undefined
  const integrations = deferred()
  let integrationsConfigured = false
  let integrationFailure = null
  void integrations.promise.catch(() => {})
  const waitForIntegrations = async () => integrations.promise
  const hostEnvironment = {
    ...environment,
    ...(isPackaged ? { TASKWEAVER_PACKAGED: '1' } : {}),
    ...(isPackaged && resourcesPath ? { TASKWEAVER_RESOURCES_PATH: resourcesPath } : {}),
  }

  const hostManager = createZHostManager({
    runtimeRoot,
    opencodexPackageRoot,
    userDataPath: userData,
    environment: hostEnvironment,
    getMcpRuntimeIntegration: async () => {
      const { mcp } = await waitForIntegrations()
      return mcp.prepareRuntimeIntegration()
    },
    getWebSearchRuntimeIntegration: async () => {
      const { webSearch } = await waitForIntegrations()
      return webSearch.prepareRuntimeIntegration()
    },
    getCompactionRuntimeIntegration: async () => {
      const { appPreferences } = await waitForIntegrations()
      return {
        environment: {
          TASKWEAVER_COMPACTION_THRESHOLD_RATIO: String(
            (await appPreferences.get()).compactionThresholdRatio,
          ),
        },
      }
    },
  })

  const bootstrap = createAppBootstrap({
    userData,
    appPath,
    isPackaged,
    hostManager,
  })

  return {
    hostManager,
    bootstrap,
    runtimeRoot,
    hostNodeExecutable: hostNode.executable,
    configureHostRuntimeIntegrations({ mcp, webSearch, appPreferences }) {
      if (integrationFailure) throw integrationFailure
      if (integrationsConfigured) {
        throw new Error('backend Host runtime integrations were already configured')
      }
      if (!mcp?.prepareRuntimeIntegration || !webSearch?.prepareRuntimeIntegration || !appPreferences?.get) {
        throw new TypeError('backend Host runtime integrations are incomplete')
      }
      integrationsConfigured = true
      integrations.resolve({ mcp, webSearch, appPreferences })
    },
    configureBootstrapServices(services) {
      bootstrap.configureServices(services)
    },
    fail(error) {
      const reason = error instanceof Error ? error : new Error(String(error ?? '后端服务组合失败'))
      if (!integrationsConfigured && !integrationFailure) {
        integrationFailure = reason
        integrations.reject(reason)
      }
      bootstrap.rejectServiceConfiguration(reason)
    },
  }
}
