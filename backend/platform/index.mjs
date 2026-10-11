/**
 * Platform abstraction interface.
 * All platform-specific capabilities (UI dialogs, keychain secrets, shell opening, events)
 * must be accessed exclusively through this contract.
 *
 * @typedef {{
 *   paths: {
 *     userData: string,
 *     appRoot: string,
 *     documents: string,
 *     logs: string,
 *   },
 *   app: {
 *     version: string,
 *     isPackaged: boolean,
 *   },
 *   events: {
 *     emit(channel: string, payload: unknown): void,
 *   },
 *   ui: {
 *     showMessageBox(options: { type?: string, title?: string, message: string, buttons?: string[], defaultId?: number, cancelId?: number }): Promise<{ response: number }>,
 *     pickDirectory(options?: { title?: string, defaultPath?: string }): Promise<string | null>,
 *     pickFiles(options?: { title?: string, defaultPath?: string, filters?: Array<{ name: string, extensions: string[] }>, allowMultiple?: boolean }): Promise<string[]>,
 *     showSaveDialog(options?: { title?: string, defaultPath?: string, filters?: Array<{ name: string, extensions: string[] }> }): Promise<string | null>,
 *   },
 *   shell: {
 *     openExternal(url: string): Promise<void>,
 *     openPath(filePath: string): Promise<string>,
 *   },
 *   secrets: {
 *     get(key: string): Promise<string | null>,
 *     set(key: string, value: string): Promise<void>,
 *     delete(key: string): Promise<void>,
 *     list(prefix?: string): Promise<string[]>,
 *   },
 *   fetch: typeof globalThis.fetch,
 * }} Platform
 */

export {}
