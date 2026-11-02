import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { _electron } from "playwright-core";
//#region lib/types/index.js
const ACTION_TIMEOUT_MS = 1e4;
const SESSION_TIMEOUT_MS = 3e5;
function validateUiTarget(target) {
	if (!target || typeof target !== "object") throw new Error("UI actions require a testid or role/name target");
	if ("testId" in target) {
		if (typeof target.testId !== "string" || target.testId.trim() === "" || "role" in target || "name" in target) throw new Error("testId targets must contain only a non-empty testId");
		return;
	}
	if (!("role" in target) || !("name" in target)) throw new Error("UI actions require a testid or role/name target");
	if (typeof target.role !== "string" || typeof target.name !== "string" || !target.name.trim()) throw new Error("role targets require both role and a non-empty accessible name");
}
function createUiVerifyEnvironment(userDataPath, sourceEnvironment = process.env, runtimeRoot, startupTracePath) {
	const allow = [
		"PATH",
		"HOME",
		"TMPDIR",
		"TEMP",
		"TMP",
		"LANG",
		"LC_ALL",
		"LC_CTYPE",
		"TERM",
		"SYSTEMROOT",
		"WINDIR"
	];
	const env = {};
	for (const key of allow) {
		const value = sourceEnvironment[key];
		if (value !== void 0) env[key] = value;
	}
	env.TASKWEAVER_E2E = "1";
	env.TASKWEAVER_UI_VERIFY = "1";
	env.TASKWEAVER_UI_VERIFY_MOCK = "1";
	env.TASKWEAVER_USER_DATA = userDataPath;
	env.TASKWEAVER_HOME = path.join(userDataPath, "runtime-home");
	if (runtimeRoot) env.TASKWEAVER_RUNTIME = path.resolve(runtimeRoot);
	if (startupTracePath) {
		env.TASKWEAVER_STARTUP_TRACE = "1";
		env.TASKWEAVER_STARTUP_TRACE_FILE = path.resolve(startupTracePath);
	}
	return env;
}
async function assertTaskWeaverRoot(root) {
	const canonical = await realpath(root);
	const manifestPath = path.join(canonical, "package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (!manifest || typeof manifest !== "object" || manifest.name !== "taskweaver-desktop") throw new Error("UI verification is enabled only for a TaskWeaver repository (package.json name must be taskweaver-desktop)");
	if (manifest.main !== "desktop/main.cjs") throw new Error("TaskWeaver UI verification requires the repository Electron entry at desktop/main.cjs");
	return canonical;
}
/**
* A bounded, isolated Playwright Electron session for the current TaskWeaver
* development checkout. Locators deliberately expose no arbitrary CSS or URL
* surface to callers.
*/
var UiVerifySession = class UiVerifySession {
	root;
	artifactsDir;
	userDataPath;
	startupTracePath;
	actionTimeoutMs;
	sessionTimeoutMs;
	startedAt = Date.now();
	app = null;
	page = null;
	errors = [];
	processLogs = [];
	screenshotCounter = 0;
	closed = false;
	sessionTimeout;
	traceStarted = false;
	constructor(options, root) {
		this.root = root;
		this.artifactsDir = path.resolve(options.artifactsDir, `${Date.now()}-${randomUUID()}`);
		this.userDataPath = path.join(this.artifactsDir, "user-data");
		this.startupTracePath = path.join(this.artifactsDir, "startup-trace.jsonl");
		this.actionTimeoutMs = Math.max(1, Math.min(options.actionTimeoutMs ?? 1e4, ACTION_TIMEOUT_MS));
		this.sessionTimeoutMs = Math.max(1, Math.min(options.sessionTimeoutMs ?? 3e5, SESSION_TIMEOUT_MS));
	}
	static async launch(options) {
		const root = await assertTaskWeaverRoot(options.root);
		const session = new UiVerifySession(options, root);
		await mkdir(session.artifactsDir, { recursive: true });
		await mkdir(session.userDataPath, { recursive: true });
		await mkdir(path.join(session.userDataPath, "runtime-home"), { recursive: true });
		const app = await _electron.launch({
			args: [root],
			cwd: root,
			env: createUiVerifyEnvironment(session.userDataPath, process.env, path.join(root, "packages/runtime"), session.startupTracePath),
			timeout: options.launchTimeoutMs ?? 6e4
		});
		session.app = app;
		const child = app.process();
		for (const [streamName, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) stream?.on("data", (chunk) => {
			session.processLogs.push(`[${streamName}] ${String(chunk)}`);
			while (session.processLogs.reduce((size, line) => size + line.length, 0) > 32e3) session.processLogs.shift();
		});
		try {
			await app.context().tracing.start({
				screenshots: true,
				snapshots: true,
				sources: false
			});
			session.traceStarted = true;
			app.on("window", (page) => session.observePage(page));
			const page = await app.firstWindow({ timeout: options.launchTimeoutMs ?? 6e4 });
			session.observePage(page);
			await page.waitForLoadState("domcontentloaded", { timeout: options.launchTimeoutMs ?? 6e4 });
			session.page = page;
			const remaining = session.sessionTimeoutMs - (Date.now() - session.startedAt);
			if (remaining <= 0) throw new Error(`UI verification session exceeded its ${session.sessionTimeoutMs}ms limit during launch`);
			session.sessionTimeout = setTimeout(() => {
				session.close().catch((error) => {
					session.errors.push(`session timeout cleanup: ${error instanceof Error ? error.message : String(error)}`);
				});
			}, remaining);
			session.sessionTimeout.unref?.();
			return session;
		} catch (error) {
			await session.close();
			throw error;
		}
	}
	async startupTraceEvents() {
		return (await readFile(this.startupTracePath, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean).flatMap((line) => {
			try {
				const event = JSON.parse(line);
				if (!event || typeof event !== "object") return [];
				const row = event;
				if (typeof row.event !== "string" || !Number.isFinite(row.elapsedMs)) return [];
				return [event];
			} catch {
				return [];
			}
		});
	}
	observedPages = /* @__PURE__ */ new WeakSet();
	observePage(page) {
		if (this.observedPages.has(page)) return;
		this.observedPages.add(page);
		page.on("console", (message) => {
			if (message.type() === "error") this.errors.push(`console: ${message.text()}`);
		});
		page.on("pageerror", (error) => this.errors.push(`pageerror: ${error.stack ?? error.message}`));
		page.on("crash", () => this.errors.push("page crashed"));
	}
	currentPage() {
		if (this.closed || !this.page) throw new Error("UI verification session is not running");
		if (Date.now() - this.startedAt >= this.sessionTimeoutMs) throw new Error(`UI verification session exceeded its ${this.sessionTimeoutMs}ms limit`);
		return this.page;
	}
	locator(target) {
		validateUiTarget(target);
		const page = this.currentPage();
		return "testId" in target ? page.getByTestId(target.testId) : page.getByRole(target.role, {
			name: target.name,
			exact: true
		});
	}
	async action(operation) {
		const page = this.currentPage();
		const remaining = this.sessionTimeoutMs - (Date.now() - this.startedAt);
		if (remaining <= 0) throw new Error(`UI verification session exceeded its ${this.sessionTimeoutMs}ms limit`);
		let timer;
		try {
			return await Promise.race([operation(page), new Promise((_, reject) => {
				timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`UI action exceeded ${this.actionTimeoutMs}ms`)), Math.min(this.actionTimeoutMs, remaining));
			})]);
		} finally {
			if (timer !== void 0) clearTimeout(timer);
		}
	}
	async snapshot() {
		return await this.action((page) => page.locator("body").ariaSnapshot({ timeout: this.actionTimeoutMs }));
	}
	async click(target) {
		const locator = this.locator(target);
		await this.action(() => locator.click({ timeout: this.actionTimeoutMs }));
	}
	async fill(target, value) {
		const locator = this.locator(target);
		await this.action(() => locator.fill(value, { timeout: this.actionTimeoutMs }));
	}
	async press(target, key) {
		if (typeof key !== "string" || key.length === 0 || key.length > 40) throw new Error("key must be a non-empty short Playwright key name");
		const locator = this.locator(target);
		await this.action(() => locator.press(key, { timeout: this.actionTimeoutMs }));
	}
	async waitFor(target, state = "visible") {
		const locator = this.locator(target);
		await this.action(() => locator.waitFor({
			state,
			timeout: this.actionTimeoutMs
		}));
	}
	async expectVisible(target) {
		await this.waitFor(target, "visible");
	}
	async expectText(target, text) {
		if (typeof text !== "string" || text.length > 2e3) throw new Error("expected text must be a string of at most 2000 characters");
		const locator = this.locator(target);
		await this.action(() => locator.getByText(text, { exact: false }).waitFor({
			state: "visible",
			timeout: this.actionTimeoutMs
		}));
	}
	screenshotPath(name) {
		this.currentPage();
		const label = (name ?? `step-${++this.screenshotCounter}`).replace(/[^a-z0-9._-]/giu, "-").slice(0, 80) || `step-${++this.screenshotCounter}`;
		return path.join(this.artifactsDir, `${label}.png`);
	}
	async screenshot(name) {
		const page = this.currentPage();
		const output = this.screenshotPath(name);
		await this.action(() => page.screenshot({
			path: output,
			fullPage: false,
			timeout: this.actionTimeoutMs
		}));
		return output;
	}
	consoleErrors() {
		return [...this.errors];
	}
	processOutput() {
		return this.processLogs.join("").slice(-32e3);
	}
	async saveTrace() {
		const app = this.app;
		if (!app || !this.traceStarted) return void 0;
		this.traceStarted = false;
		const output = path.join(this.artifactsDir, "trace.zip");
		await app.context().tracing.stop({ path: output });
		return output;
	}
	processId() {
		const pid = this.app?.process()?.pid;
		return Number.isSafeInteger(pid) && (pid ?? 0) > 0 ? pid : void 0;
	}
	async check(assertions) {
		if (assertions.length === 0 || assertions.length > 20) throw new Error("ui_check requires between 1 and 20 assertions");
		const results = [];
		for (const assertion of assertions) try {
			if (assertion.kind === "visible") await this.expectVisible(assertion.target);
			else if (assertion.kind === "text" && assertion.text !== void 0) await this.expectText(assertion.target, assertion.text);
			else throw new Error("text assertions require expected text");
			results.push({
				kind: assertion.kind,
				target: assertion.target,
				passed: true,
				screenshot: await this.screenshot()
			});
		} catch (error) {
			results.push({
				kind: assertion.kind,
				target: assertion.target,
				passed: false,
				error: error instanceof Error ? error.message : String(error),
				screenshot: this.page ? await this.screenshot().catch(() => void 0) : void 0
			});
		}
		return results;
	}
	async close() {
		if (this.closed) return;
		this.closed = true;
		if (this.sessionTimeout !== void 0) clearTimeout(this.sessionTimeout);
		this.sessionTimeout = void 0;
		const app = this.app;
		this.app = null;
		this.page = null;
		if (!app) return;
		const child = app.process();
		try {
			if (this.traceStarted) {
				this.traceStarted = false;
				await app.context().tracing.stop({ path: path.join(this.artifactsDir, "trace.zip") });
			}
		} catch (error) {
			this.errors.push(`trace cleanup: ${error instanceof Error ? error.message : String(error)}`);
		}
		try {
			await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5e3))]);
		} finally {
			if (child && child.exitCode === null && child.signalCode === null) {
				const exited = new Promise((resolve) => child.once("exit", () => resolve()));
				child.kill("SIGTERM");
				await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1e3))]);
				if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			}
		}
	}
};
async function assertTaskWeaverProject(root) {
	return await assertTaskWeaverRoot(root);
}
//#endregion
export { ACTION_TIMEOUT_MS, SESSION_TIMEOUT_MS, UiVerifySession, assertTaskWeaverProject, createUiVerifyEnvironment, validateUiTarget };
