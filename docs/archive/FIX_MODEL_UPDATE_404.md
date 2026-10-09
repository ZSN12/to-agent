# 修复模型更新 404 错误

## 问题分析

### 症状
- 用户点击"检查模型更新"按钮后显示"更新失败（HTTP 404）"
- 模型目录显示 "2026.09.28.1 更新失败"
- 错误信息：下载失败（HTTP 404）

### 根本原因
TaskWeaver 是基于 DSH 的 fork 项目（使用 Z Runtime），但模型目录更新器仍然指向上游 DSH 的模型目录服务器：

```javascript
// electron/backend/model-registry-updater.mjs:7
const DEFAULT_MANIFEST_URL = 'https://github.com/ZSN12/to-agent/releases/download/model-registry/model-registry-manifest.v1.json'
```

这个 URL 返回 404，因为：
1. TaskWeaver 项目的 fork 仓库 `ZSN12/to-agent` 没有发布模型目录
2. Z Runtime 是独立维护的运行时，不应该从上游 DSH 更新模型目录
3. TaskWeaver 使用的是 `packages/runtime` 打包的本地运行时

### 影响范围
- **优先级**：P2（不影响核心功能，但影响用户体验）
- **影响用户**：所有点击"检查模型更新"的用户
- **核心功能影响**：无（本地模型目录和凭据正常工作）

## 修复方案

### 方案 1：禁用在线更新（推荐）

**理由**：
- TaskWeaver 是独立的毕设项目，使用打包的 Z Runtime
- 模型目录应该跟随 Z Runtime 版本，而不是在线更新
- 避免与上游 DSH 的模型目录版本不兼容

**实现**：
1. 在 UI 中隐藏"检查模型更新"按钮
2. 将更新状态改为"使用内置模型目录"
3. 保留手动"刷新目录"功能（重新读取本地目录）

### 方案 2：指向 TaskWeaver 自己的模型目录服务（备选）

**理由**：
- 如果将来需要独立发布模型目录更新
- 需要额外维护 GitHub Release 或 CDN

**实现**：
1. 创建 TaskWeaver 的模型目录发布流程
2. 修改 `DEFAULT_MANIFEST_URL` 指向 TaskWeaver 仓库
3. 配置 GitHub Actions 自动发布

### 方案 3：降级处理 404 错误（临时方案）

**理由**：
- 快速修复，不改变功能
- 对用户更友好的错误提示

**实现**：
1. 捕获 404 错误，静默失败或显示"使用内置目录"
2. 不显示红色错误状态

## 推荐实现：方案 1

禁用在线更新，改为"使用内置模型目录 + 实时发现"。

### 代码变更

#### 1. UI 层面：隐藏更新按钮，改为"刷新目录"

**文件**: `src/features/models/ModelSettingsPanel.tsx`

变更：
- 移除"检查模型更新"按钮（line 1122-1134）
- 简化更新状态显示，改为"模型目录状态"
- 保留"刷新目录"功能（重新加载本地目录）

#### 2. 后端层面：禁用自动更新检查

**文件**: `electron/backend/model-registry-updater.mjs`

选项 A（彻底禁用）：
```javascript
async function performCheck(force) {
  // TaskWeaver 使用打包的 Z Runtime，不支持在线更新
  return persistStatus({ 
    state: 'idle', 
    error: 'TaskWeaver 使用内置模型目录（跟随 Z Runtime 版本）',
    lastCheckedAt: new Date(now()).toISOString()
  })
}
```

选项 B（静默失败）：
```javascript
async function performCheck(force) {
  const status = await getStatus()
  // 检查环境变量，如果未配置更新 URL 则跳过
  if (!manifestUrl || manifestUrl.includes('to-agent/releases')) {
    return persistStatus({ 
      state: 'up-to-date', 
      error: null,
      lastCheckedAt: new Date(now()).toISOString()
    })
  }
  // ... 原有逻辑
}
```

#### 3. IPC 层面：返回友好状态

**文件**: `electron/backend/register-ipc.mjs`

```javascript
ipcHandle(ipcMain, 'models:checkForUpdates', async (_event, options) => {
  // TaskWeaver 使用内置模型目录，返回"已是最新"状态
  const currentStatus = await modelRegistryUpdater.getStatus()
  return {
    ...currentStatus,
    state: 'up-to-date',
    error: null,
    message: 'TaskWeaver 使用打包的 Z Runtime 模型目录'
  }
})
```

## 实施步骤

### Step 1: 修改 UI（移除更新按钮）

```tsx
// src/features/models/ModelSettingsPanel.tsx
// 移除或注释掉 1122-1134 行的"检查模型更新"按钮
{updateStatus.previousVersion && onRollbackRegistry && (
  <button type="button" className="settings-secondary-button" onClick={() => void onRollbackRegistry()}>
    回滚目录
  </button>
)}
{/* 移除在线更新按钮 - TaskWeaver 使用内置模型目录 */}
```

### Step 2: 简化状态显示

```tsx
// 修改状态卡片显示（line 1072-1137）
{updateStatus && (
  <div className="model-registry-status model-registry-status-idle">
    <div className="model-registry-status-copy">
      <div className="model-registry-status-title">
        <span className="model-registry-status-dot" />
        模型目录 {updateStatus.currentVersion || '内置版'}
        <span className="model-registry-status-badge">就绪</span>
      </div>
      <div className="model-registry-status-meta">
        内置于 Z Runtime · 点击右上角「刷新目录」重新加载
      </div>
      {updateStatus.runtime && (
        <div className="model-registry-status-meta">
          Z {updateStatus.runtime.dsh?.version || '未知'} · pi-ai {updateStatus.runtime.piAi?.version || '未知'} · Overlay v{updateStatus.runtime.overlayVersion ?? '未知'}
        </div>
      )}
    </div>
  </div>
)}
```

### Step 3: 禁用后端更新检查

```javascript
// electron/backend/model-registry-updater.mjs
// 在 performCheck 函数开头添加：
async function performCheck(force) {
  // TaskWeaver fork: 使用打包的 Z Runtime，禁用在线更新
  const status = await getStatus()
  return persistStatus({ 
    state: 'up-to-date', 
    error: null,
    lastCheckedAt: new Date(now()).toISOString(),
    message: 'TaskWeaver 使用内置模型目录（跟随 Z Runtime 版本）'
  })
  
  // 原有的在线更新逻辑（已禁用）
  // const lastCheck = Date.parse(status.lastCheckedAt || '')
  // ...
}
```

## 测试验证

1. 启动应用，进入"模型与来源"设置页
2. 验证不显示"检查模型更新"按钮
3. 验证状态卡片显示"就绪"而不是"更新失败"
4. 点击"刷新目录"，验证能正常重新加载模型列表
5. 验证运行时版本信息正常显示

## 回滚方案

如果需要恢复在线更新功能：
1. 配置 `TASKWEAVER_MODEL_REGISTRY_MANIFEST_URL` 环境变量指向有效的 URL
2. 恢复 UI 中的"检查模型更新"按钮
3. 移除 `performCheck` 中的早期返回逻辑

## 后续优化

### 如果需要独立的模型目录更新

1. 创建 TaskWeaver 模型目录仓库
2. 配置 GitHub Actions 自动发布
3. 更新 `DEFAULT_MANIFEST_URL` 指向 TaskWeaver 的 Release
4. 确保模型目录与 Z Runtime 版本兼容

### 改进模型发现

当前已有"实时发现"功能（`liveDiscovery`），可以：
1. 增强提供方 API 的模型发现
2. 本地扫描已安装的模型
3. 从 Z Runtime 内置数据加载

## 相关文件

- `/Users/zsn/Documents/毕设/src/features/models/ModelSettingsPanel.tsx` (UI)
- `/Users/zsn/Documents/毕设/electron/backend/model-registry-updater.mjs` (更新器)
- `/Users/zsn/Documents/毕设/electron/backend/model-service.mjs` (模型服务)
- `/Users/zsn/Documents/毕设/electron/backend/register-ipc.mjs` (IPC 注册)

## 结论

**推荐方案**：禁用在线更新，改为"使用内置模型目录"。

**理由**：
1. TaskWeaver 是独立的 fork，不应依赖上游 DSH 的模型目录
2. Z Runtime 是打包的本地运行时，模型目录应该跟随版本
3. 现有的"刷新目录"和"实时发现"已经足够满足需求
4. 避免 404 错误影响用户体验

**工作量**：约 2-3 小时
- UI 修改：30 分钟
- 后端逻辑：1 小时
- 测试验证：1 小时
