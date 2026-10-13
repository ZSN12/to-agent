/** Desktop backend runs without an Electron BrowserWindow (Swift / WebView2 shell). */
export function isShellBackend() {
  return process.env.TASKWEAVER_SHELL_SERVER === '1'
}
