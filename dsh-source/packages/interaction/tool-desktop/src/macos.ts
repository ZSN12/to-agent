/**
 * macOS desktop backend: capture the screen and inject real input events
 * (cursor, mouse, keyboard) through `osascript -l JavaScript` (JXA + the
 * CoreGraphics/AppKit ObjC bridge) and `screencapture`. The whole OS boundary
 * is behind an injectable `RunCommand` so REAL-composition tests can stub only
 * this seam.
 * @module @deepseek-ai/dsh-tool-desktop
 */

import { Buffer } from 'node:buffer'
import type { KeyboardActionPlan, Modifier, MouseActionPlan, Point, ScreenshotPlan } from './types.ts'

/** Execute one native command and return its combined output. */
export interface RunCommand {
  (script: string): Promise<string>
}

/** The OS-facing surface the desktop backend needs. */
export interface DesktopDriver {
  /** Capture the primary display and write it to `path`; return dimensions. */
  screenshot(path: string): Promise<ScreenshotPlan>
  /** Current cursor position, or null if it cannot be read. */
  cursorPosition(): Promise<Point | null>
  /** Bundle id of the frontmost app, or null if unknown. */
  frontmostBundleId(): Promise<string | null>
  /** Inject one mouse action plan (move/click/double_click/scroll/drag). */
  mouse(plan: MouseActionPlan): Promise<void>
  /** Inject one keyboard action plan (type/key_combo/shortcut). */
  keyboard(plan: KeyboardActionPlan): Promise<void>
}

const JS_PREFIX = 'ObjC.import("CoreGraphics");ObjC.import("AppKit");'

/** Turn a JXA expression that returns a JS string into an -e argument. */
function jxa(expression: string): string {
  return `-l JavaScript -e '${JS_PREFIX}${expression}'`
}

/** Quote one value as a POSIX shell single-quoted word. */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Common keys to macOS virtual keycodes (ANSI layout). */
const KEYCODES: Record<string, number> = {
  return: 36,
  enter: 76,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  'left': 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  a: 0,
  b: 11,
  c: 8,
  d: 2,
  e: 14,
  f: 3,
  g: 5,
  h: 4,
  j: 38,
  k: 40,
  l: 37,
  m: 46,
  n: 45,
  o: 31,
  p: 35,
  q: 12,
  r: 15,
  s: 1,
  t: 17,
  u: 32,
  v: 9,
  w: 13,
  x: 7,
  y: 16,
  z: 6,
  '0': 29,
  '1': 18,
  '2': 19,
  '3': 20,
  '4': 21,
  '5': 23,
  '6': 22,
  '7': 26,
  '8': 28,
  '9': 25,
}

/** macOS CGEvent modifier-flag bits. */
function modifierFlags(mods: Modifier[]): number {
  let flags = 0
  for (const m of mods) {
    if (m === 'command') flags |= 0x100000
    if (m === 'control') flags |= 0x40000
    if (m === 'option') flags |= 0x80000
    if (m === 'shift') flags |= 0x20000
  }
  return flags
}

/**
 * macOS driver shelling out to `osascript` and `screencapture`.
 * @param run - command runner (subprocess / ctx.shell), injected for testability
 * @returns a desktop driver over the OS boundary
 */
export function macosDriver(run: RunCommand): DesktopDriver {
  const screenshot = async (path: string): Promise<ScreenshotPlan> => {
    // screencapture -x writes silently (no shutter sound) to the given path.
    await run(`screencapture -x ${shellSingleQuote(path)}`)
    // Read the primary display size (in points) from CoreGraphics.
    const size = await run(jxa('const id=$.CGMainDisplayID();String($.CGDisplayPixelsWide(id))+","+String($.CGDisplayPixelsHigh(id));'))
    const [width, height] = size.split(',').map(s => Math.round(Number(s)))
    return { path, width: width || 0, height: height || 0 }
  }

  const cursorPosition = async (): Promise<Point | null> => {
    try {
      const out = await run(jxa('const e=$.CGEventCreate($());const l=$.CGEventGetLocation(e);String(l.x)+","+String(l.y);'))
      const parts = out.split(',')
      const x = Number(parts[0])
      const y = Number(parts[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x, y }
    } catch {
      return null
    }
  }

  const frontmostBundleId = async (): Promise<string | null> => {
    try {
      // The `-e` argument is shell-single-quoted, so the JXA must use double
      // quotes for ObjC.import (nesting single quotes would break the shell).
      const out = await run(
        // oxlint-disable-next-line @stylistic/quotes
        `-l JavaScript -e 'ObjC.import("AppKit");const ws=$.NSWorkspace.sharedWorkspace;ws.frontmostApplication.bundleIdentifier.js;'`,
      )
      return out.trim() || null
    } catch {
      return null
    }
  }

  const mouse = async (plan: MouseActionPlan): Promise<void> => {
    const target = plan.point
    if (plan.gesture === 'move' && target) {
      await run(
        jxa(`const t=$.CGPointMake(${target.x},${target.y});const m=$.CGEventCreateMouseEvent($(),$.kCGEventMouseMoved,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);`),
      )
      return
    }
    if ((plan.gesture === 'click' || plan.gesture === 'double_click') && target) {
      const count = plan.gesture === 'double_click' ? 2 : 1
      for (let i = 0; i < count; i++) {
        await run(
          jxa(`const t=$.CGPointMake(${target.x},${target.y});const d=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDown,t,$.kCGMouseButtonLeft);const u=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseUp,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,d);$.CGEventPost($.kCGHIDEventTap,u);`),
        )
      }
      return
    }
    if (plan.gesture === 'scroll') {
      const dy = plan.deltaY ?? 0
      await run(
        jxa(`const e=$.CGEventCreateScrollWheelEvent($(),$.kCGScrollEventUnitLine,1,${dy},0);$.CGEventPost($.kCGHIDEventTap,e);`),
      )
      return
    }
    if (plan.gesture === 'drag' && target) {
      await run(
        jxa(`const t=$.CGPointMake(${target.x},${target.y});const m=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDragged,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);`),
      )
      return
    }
  }

  const keyboard = async (plan: KeyboardActionPlan): Promise<void> => {
    if (plan.gesture === 'type' && plan.text !== undefined) {
      // Pass the text as base64 so quotes, backslashes, and control characters
      // can never break out of the shell-quoted JXA expression.
      const encoded = Buffer.from(plan.text, 'utf8').toString('base64')
      await run(
        jxa(`const d=$.NSData.alloc.initWithBase64EncodedStringOptions('${encoded}',0);const s=$.NSString.alloc.initWithDataEncoding(d,4);const e=$.CGEventCreateKeyboardEvent($(),0,true);$.CGEventKeyboardSetUnicodeString(e,s.length,s);$.CGEventPost($.kCGHIDEventTap,e);const u=$.CGEventCreateKeyboardEvent($(),0,false);$.CGEventPost($.kCGHIDEventTap,u);`),
      )
      return
    }
    if ((plan.gesture === 'key_combo' || plan.gesture === 'shortcut') && plan.key !== undefined) {
      const keyCode = KEYCODES[plan.key.toLowerCase()]
      if (keyCode === undefined) {
        throw new Error(`desktop: unsupported key "${plan.key}" for macOS key_combo`)
      }
      const modFlags = modifierFlags(plan.modifiers ?? [])
      await run(
        jxa(`const d=$.CGEventCreateKeyboardEvent($(),${keyCode},true);d.setIntegerValueField($.kCGKeyboardEventKeycode,${keyCode});d.flags=${modFlags};$.CGEventPost($.kCGHIDEventTap,d);const u=$.CGEventCreateKeyboardEvent($(),${keyCode},false);u.setIntegerValueField($.kCGKeyboardEventKeycode,${keyCode});u.flags=${modFlags};$.CGEventPost($.kCGHIDEventTap,u);`),
      )
      return
    }
  }

  return { screenshot, cursorPosition, frontmostBundleId, mouse, keyboard }
}
