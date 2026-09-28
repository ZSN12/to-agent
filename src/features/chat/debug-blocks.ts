const KEY = 'taskweaver-debug-blocks'

/** 控制台执行 localStorage.setItem('taskweaver-debug-blocks','1') 后刷新，可在气泡里看到段落 id */
export function isDebugBlocksEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setDebugBlocksEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
