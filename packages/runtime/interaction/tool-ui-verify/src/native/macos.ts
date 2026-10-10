import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface NativePoint {
  /** Horizontal offset from the isolated TaskWeaver window's top-left, in points. */
  x: number
  /** Vertical offset from the isolated TaskWeaver window's top-left, in points. */
  y: number
}

export interface NativeWindow {
  id: number
  x: number
  y: number
  width: number
  height: number
}

export interface NativePermissions {
  accessibility: boolean
  screenRecording: boolean
}

const NATIVE_KEY_CODES: Record<string, number> = {
  enter: 36,
  return: 36,
  tab: 48,
  escape: 53,
  delete: 51,
  space: 49,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  a: 0,
}

export interface MacNativeRunner {
  (file: string, args: readonly string[]): Promise<string>
}

const jxaPrefix = 'ObjC.import("AppKit");ObjC.import("CoreGraphics");ObjC.import("ApplicationServices");'

function validatePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Native UI verification requires the isolated TaskWeaver process id')
}

function validatePoint(point: NativePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) {
    throw new Error('Native point must use non-negative window-relative coordinates in points')
  }
}

function scriptNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Native coordinate must be finite')
  return String(Math.round(value * 100) / 100)
}

/** Execute only argv-based native helpers; no command string is interpreted by a shell. */
const defaultRunner: MacNativeRunner = async (file, args) => {
  const result = await execFileAsync(file, [...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 256 * 1024 })
  return String(result.stdout).trim()
}

/**
 * macOS-only fallback, bound to one live TaskWeaver Electron PID. It cannot
 * activate an app, enumerate arbitrary app windows, or click outside the
 * current on-screen TaskWeaver window. Native point coordinates are window
 * relative; screenshots are captured by window id and resized to point size.
 */
export class MacNativeUiFallback {
  private readonly run: MacNativeRunner
  private readonly pid: number

  constructor(pid: number, runner: MacNativeRunner = defaultRunner) {
    validatePid(pid)
    this.pid = pid
    this.run = runner
  }

  private async jxa(expression: string): Promise<string> {
    return await this.run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `${jxaPrefix}${expression}`])
  }

  async permissions(): Promise<NativePermissions> {
    if (process.platform !== 'darwin') return { accessibility: false, screenRecording: false }
    const result = await this.jxa('JSON.stringify({accessibility:$.AXIsProcessTrusted(),screenRecording:$.CGPreflightScreenCaptureAccess()})')
    const value = JSON.parse(result) as Partial<NativePermissions>
    return {
      accessibility: value.accessibility === true,
      screenRecording: value.screenRecording === true,
    }
  }

  async targetWindow(): Promise<NativeWindow> {
    if (process.platform !== 'darwin') throw new Error('Native UI fallback is macOS-only')
    const expression = `const pid=${this.pid};const rows=ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,$.kCGNullWindowID));const w=rows.find(x=>Number(x.kCGWindowOwnerPID)===pid&&Number(x.kCGWindowLayer)===0&&Number(x.kCGWindowAlpha)>0);if(!w)throw new Error("TaskWeaver window is not on screen");const b=w.kCGWindowBounds;JSON.stringify({id:Number(w.kCGWindowNumber),x:Number(b.X),y:Number(b.Y),width:Number(b.Width),height:Number(b.Height)});`
    const window = JSON.parse(await this.jxa(expression)) as NativeWindow
    if (!Number.isSafeInteger(window.id) || window.id <= 0 || !Number.isFinite(window.x) || !Number.isFinite(window.y)
      || !Number.isFinite(window.width) || !Number.isFinite(window.height) || window.width <= 0 || window.height <= 0) {
      throw new Error('Could not identify an on-screen window for the TaskWeaver verification instance')
    }
    return window
  }

  private frontmostGuard(): string {
    return `const pid=${this.pid};const front=Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);if(front!==pid)throw new Error("Native UI action refused: the isolated TaskWeaver window is not frontmost");`
  }

  async screenshot(outputPath: string): Promise<string> {
    if (process.platform !== 'darwin') throw new Error('Native UI fallback is macOS-only')
    const window = await this.targetWindow()
    const output = path.resolve(outputPath)
    const raw = `${output}.retina.png`
    try {
      await this.run('/usr/sbin/screencapture', ['-x', '-l', String(window.id), raw])
      // CG window capture is in physical pixels on Retina displays. Resize to
      // the window's point dimensions so coordinates and evidence share units.
      await this.run('/usr/bin/sips', [
        '-z', String(Math.max(1, Math.round(window.height))),
        String(Math.max(1, Math.round(window.width))), raw, '--out', output,
      ])
      return output
    } finally {
      await rm(raw, { force: true }).catch(() => undefined)
    }
  }

  async click(point: NativePoint): Promise<void> {
    validatePoint(point)
    if (process.platform !== 'darwin') throw new Error('Native UI fallback is macOS-only')
    const guard = this.frontmostGuard()
    const x = scriptNumber(point.x)
    const y = scriptNumber(point.y)
    const expression = `${guard}const rows=ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,$.kCGNullWindowID));const w=rows.find(x=>Number(x.kCGWindowOwnerPID)===pid&&Number(x.kCGWindowLayer)===0&&Number(x.kCGWindowAlpha)>0);if(!w)throw new Error("TaskWeaver window is not on screen");const b=w.kCGWindowBounds;if(${x}>=Number(b.Width)||${y}>=Number(b.Height))throw new Error("Native point is outside the TaskWeaver window bounds");const p=$.CGPointMake(Number(b.X)+${x},Number(b.Y)+${y});const d=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDown,p,$.kCGMouseButtonLeft);const u=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseUp,p,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,d);$.CGEventPost($.kCGHIDEventTap,u);`
    await this.jxa(expression)
  }

  async fill(point: NativePoint, text: string): Promise<void> {
    validatePoint(point)
    if (text.length > 16_000) throw new Error('Native text input is limited to 16000 characters')
    await this.click(point)
    await this.press('a', ['command'])
    await this.press('delete')
    await this.typeFocused(text)
  }

  async type(point: NativePoint, text: string): Promise<void> {
    validatePoint(point)
    if (text.length > 16_000) throw new Error('Native text input is limited to 16000 characters')
    await this.click(point)
    await this.typeFocused(text)
  }

  private async typeFocused(text: string): Promise<void> {
    const characters = Array.from(text)
    // Small Unicode-safe chunks stay beneath CoreGraphics' per-event string bound.
    for (let offset = 0; offset < characters.length; offset += 128) {
      const encoded = Buffer.from(characters.slice(offset, offset + 128).join(''), 'utf8').toString('base64')
      const guard = this.frontmostGuard()
      const expression = `${guard}const d=$.NSData.alloc.initWithBase64EncodedStringOptions("${encoded}",0);const s=$.NSString.alloc.initWithDataEncoding(d,4);const e=$.CGEventCreateKeyboardEvent($(),0,true);$.CGEventKeyboardSetUnicodeString(e,s.length,s);$.CGEventPost($.kCGHIDEventTap,e);const u=$.CGEventCreateKeyboardEvent($(),0,false);$.CGEventPost($.kCGHIDEventTap,u);`
      await this.jxa(expression)
    }
  }

  async press(key: string, modifiers: readonly ('command' | 'control' | 'option' | 'shift')[] = []): Promise<void> {
    if (process.platform !== 'darwin') throw new Error('Native UI fallback is macOS-only')
    const keyCode = NATIVE_KEY_CODES[key.toLowerCase()]
    if (keyCode === undefined) throw new Error(`Native key is not supported: ${key}`)
    const masks: Record<string, number> = { command: 0x100000, control: 0x40000, option: 0x80000, shift: 0x20000 }
    const flags = modifiers.reduce((value, modifier) => value | masks[modifier], 0)
    const expression = `${this.frontmostGuard()}const code=${keyCode};const flags=${flags};const d=$.CGEventCreateKeyboardEvent($(),code,true);$.CGEventSetFlags(d,flags);$.CGEventPost($.kCGHIDEventTap,d);const u=$.CGEventCreateKeyboardEvent($(),code,false);$.CGEventSetFlags(u,flags);$.CGEventPost($.kCGHIDEventTap,u);`
    await this.jxa(expression)
  }
}
