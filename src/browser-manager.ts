/** EN: Manage a dedicated browser and record-scoped navigation.
 * ZH: 管理专用浏览器及单记录范围导航。 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import type { CaptureAdapter } from "./types.js";
import { parseRecordUrl } from "./adapter.js";
import { candidateCaseDirectoryKeys } from "./evidence-store.js";
const CHROME_CANDIDATES = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];
/** EN: Define the BrowserTargetInfo contract or operation in this module.
 * ZH: 定义本模块的 BrowserTargetInfo 契约或操作。 */
export interface BrowserTargetInfo {
    mode: "embedded" | "external";
    connected: boolean;
    browserVersion: string | null;
    recordUrl: string | null;
    recordId: string | null;
    pageTitle: string | null;
    allPageCount: number;
    cdpEndpoint: string;
    profileDir: string;
    executablePath: string | null;
}
/** EN: Define the RecordStageDefinition contract or operation in this module.
 * ZH: 定义本模块的 RecordStageDefinition 契约或操作。 */
export interface RecordStageDefinition {
    id: string;
    label: string;
    domIndex: number;
}
/** EN: Define the NextRecordCandidate contract or operation in this module.
 * ZH: 定义本模块的 NextRecordCandidate 契约或操作。 */
export interface NextRecordCandidate {
    recordId: string;
    name: string;
    stageId: string;
    stageName: string;
    stageDomIndex: number;
    page: number;
    row: number;
}
/** EN: Define the RecordQueueCursor contract or operation in this module.
 * ZH: 定义本模块的 RecordQueueCursor 契约或操作。 */
export interface RecordQueueCursor {
    stageId: string;
    page: number;
    row: number;
}
/** EN: Define the recordListQueryFromUrl contract or operation in this module.
 * ZH: 定义本模块的 recordListQueryFromUrl 契约或操作。 */
export function recordListQueryFromUrl(rawUrl: string): Record<string, unknown> {
    const url = new URL(rawUrl);
    const raw = url.searchParams.get("query");
    if (!raw)
        throw new Error("客户列表 URL 缺少 query 参数");
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("客户列表 query 不是对象");
    return value as Record<string, unknown>;
}
/** EN: Derive this helper value from the supplied inputs.
 * ZH: 从提供的输入生成本辅助值。 */
export function buildRecordListForm(rawUrl: string, stageId: string, pageNo: number, pageSize: number): Array<[
    string,
    string
]> {
    const query = recordListQueryFromUrl(rawUrl);
    const output: Array<[
        string,
        string
    ]> = [
        ["curPage", String(pageNo)],
        ["layout", "1"],
        ["pageSize", String(pageSize)],
        ["show_all", String(query.show_all ?? 1)],
        ["fields", String(query.fields ?? "record.list.fields")],
        ["sort_scene", String(query.sort_scene ?? "setting")],
        ["stage_id", stageId]
    ];
    const users = Array.isArray(query.users) ? query.users : [];
    users.forEach((value, index) => output.push([`users[${index}]`, String(value)]));
    return output;
}
/** EN: Define the stageProcessingOrder contract or operation in this module.
 * ZH: 定义本模块的 stageProcessingOrder 契约或操作。 */
export function stageProcessingOrder<T>(domOrder: T[]): T[] {
    return [...domOrder].reverse();
}
/** EN: Read or normalize the supplied structure while preserving explicit identity.
 * ZH: 读取或规范化提供的结构，并保留明确身份。 */
export function normalizeStageName(label: string): string {
    return label.replace(/\s*\d+\s*$/u, "").trim();
}
/** EN: Check the condition without mutating capture evidence.
 * ZH: 检查条件，不修改采集证据。 */
export function shouldSkipCandidateByCaseDirectory(recordName: string, recordId: string, existingCaseDirectoryKeys: ReadonlySet<string>): boolean {
    for (const key of candidateCaseDirectoryKeys(recordName, recordId)) {
        if (existingCaseDirectoryKeys.has(key))
            return true;
    }
    return false;
}
/** EN: Define the completedRecordRefreshIds contract or operation in this module.
 * ZH: 定义本模块的 completedRecordRefreshIds 契约或操作。 */
export function completedRecordRefreshIds(raw: string | undefined): Set<string> {
    return new Set((raw ?? "")
        .split(/[\s,;]+/u)
        .map(value => value.trim())
        .filter(value => /^\d+$/.test(value)));
}
/** EN: Check the condition without mutating capture evidence.
 * ZH: 检查条件，不修改采集证据。 */
export function shouldSkipCompletedCandidate(recordId: string, completedRecordIds: ReadonlySet<string>, refreshCompletedRecordIds: ReadonlySet<string>, refreshedCompletedRecordIds: ReadonlySet<string>): boolean {
    return completedRecordIds.has(recordId)
        && (!refreshCompletedRecordIds.has(recordId) || refreshedCompletedRecordIds.has(recordId));
}
/** EN: Define the BrowserManager contract or operation in this module.
 * ZH: 定义本模块的 BrowserManager 契约或操作。 */
export class BrowserManager {
    private browser: Browser | null = null;
    private process: ChildProcess | null = null;
    private refreshedCompletedRecordIds = new Set<string>();
    constructor(readonly cdpPort: number, readonly profileDir: string, private readonly adapter: CaptureAdapter) { }
    private get embeddedMode(): boolean {
        return process.env.CAPTURE_EMBEDDED_MODE === "1";
    }
    get endpoint(): string {
        return `http://127.0.0.1:${this.cdpPort}`;
    }
    /** EN: Define the findExecutable contract or operation in this module.
     * ZH: 定义本模块的 findExecutable 契约或操作。 */
    findExecutable(): string | null {
        return CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate)) ?? null;
    }
    /** EN: Enter this lifecycle operation using the configured local scope.
     * ZH: 在配置的本地范围内进入此生命周期操作。 */
    async launch(): Promise<BrowserTargetInfo> {
        if (this.embeddedMode) {
            await this.waitForEndpoint(20000);
            await this.connect();
            return this.status();
        }
        const executable = this.findExecutable();
        if (!executable)
            throw new Error("未找到 Google Chrome 或 Microsoft Edge");
        await fs.promises.mkdir(this.profileDir, { recursive: true });
        if (!(await this.isEndpointAlive())) {
            this.process = spawn(executable, [
                `--remote-debugging-port=${this.cdpPort}`,
                `--user-data-dir=${this.profileDir}`,
                `--host-resolver-rules=${this.adapter.external_ai_blocked_hosts.flatMap(host => [`MAP ${host} ~NOTFOUND`, `MAP *.${host} ~NOTFOUND`]).join(", ")}`,
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                "--disable-features=CalculateNativeWinOcclusion",
                "--disable-component-update",
                "--start-maximized",
                "about:blank"
            ], {
                detached: false,
                stdio: "ignore",
                windowsHide: false
            });
            await this.waitForEndpoint(20000);
        }
        await this.connect();
        return this.status();
    }
    /** EN: Enter this lifecycle operation using the configured local scope.
     * ZH: 在配置的本地范围内进入此生命周期操作。 */
    async connect(): Promise<Browser> {
        if (this.browser?.isConnected())
            return this.browser;
        this.browser = await chromium.connectOverCDP(this.endpoint, { timeout: 15000, isLocal: true });
        this.browser.on("disconnected", () => { this.browser = null; });
        return this.browser;
    }
    /** EN: Define the recordPage contract or operation in this module.
     * ZH: 定义本模块的 recordPage 契约或操作。 */
    async recordPage(): Promise<Page | null> {
        let browser: Browser;
        try {
            browser = await this.connect();
        }
        catch {
            return null;
        }
        const pages = browser.contexts().flatMap(context => context.pages());
        const candidates = pages.filter(page => parseRecordUrl(page.url(), this.adapter));
        return candidates.at(-1) ?? null;
    }
    /** EN: Define the recordListPage contract or operation in this module.
     * ZH: 定义本模块的 recordListPage 契约或操作。 */
    async recordListPage(): Promise<Page | null> {
        let browser: Browser;
        try {
            browser = await this.connect();
        }
        catch {
            return null;
        }
        const pages = browser.contexts().flatMap(context => context.pages());
        return pages.filter(page => {
            try {
                const url = new URL(page.url());
                return url.origin === this.adapter.origin && url.pathname === "/records";
            }
            catch {
                return false;
            }
        }).at(-1) ?? null;
    }
    /** EN: Define the nextRecordCandidate contract or operation in this module.
     * ZH: 定义本模块的 nextRecordCandidate 契约或操作。 */
    async nextRecordCandidate(completedRecordIds: Set<string>, existingCaseDirectoryKeys: ReadonlySet<string> = new Set<string>(), cursor: RecordQueueCursor | null = null, refreshCompletedRecordIds: ReadonlySet<string> = completedRecordRefreshIds(process.env.CAPTURE_REFRESH_COMPLETED_RECORD_IDS)): Promise<NextRecordCandidate | null> {
        /** EN: A directory name alone is not proof of a successful, current capture.
     * ZH: 目录名不能证明当前采集成功；仅凭 PASS 索引决定跳过，显式配置的记录每进程最多刷新一次。 */
        /** EN: Keep the positional parameter for API compatibility, but only the PASS
     * ZH: 此处解释当前操作的局部约束；保持上方英文所述的输入范围和恢复边界。 */
        /** EN: inventory controls normal skipping. Completed cases can be refreshed
     * ZH: 跳过不可用的辅助项，不生成成功凭证。 */
        /** EN: exactly once per process by listing their IDs in the environment value.
     * ZH: 此处解释当前操作的局部约束；保持上方英文所述的输入范围和恢复边界。 */
        void existingCaseDirectoryKeys;
        const page = await this.recordListPage();
        if (!page)
            throw new Error("内置浏览器当前不在客户列表页");
        const stageTitle = this.adapter.record_queue.stage_title;
        const readStages = (): Promise<RecordStageDefinition[]> => page.evaluate((title): RecordStageDefinition[] => {
            const anchors = Array.from(document.querySelectorAll("span.capture-menu-title-content"));
            const anchor = anchors.find(element => (element.textContent ?? "").trim() === title);
            const root = anchor?.closest("li.capture-menu-submenu");
            if (!root)
                return [];
            return Array.from(root.querySelectorAll(":scope > ul.capture-menu-sub > li[data-menu-id]"))
                .map((element, domIndex) => ({
                id: element.getAttribute("data-menu-id") ?? "",
                label: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
                domIndex
            }))
                .filter(item => /^\d+$/.test(item.id));
        }, stageTitle);
        let domStages = await readStages();
        if (!domStages.length) {
            const expanded = await page.evaluate((title): boolean => {
                const anchors = Array.from(document.querySelectorAll("span.capture-menu-title-content"));
                const anchor = anchors.find(element => (element.textContent ?? "").trim() === title);
                const trigger = anchor?.closest("div.capture-menu-submenu-title");
                if (!(trigger instanceof HTMLElement))
                    return false;
                trigger.click();
                return true;
            }, stageTitle);
            if (expanded) {
                await page.waitForTimeout(500);
                domStages = await readStages();
            }
        }
        if (!domStages.length)
            throw new Error("未识别到客户阶段子选项；页面结构可能已变化");
        const endpoint = new URL(this.adapter.record_queue.list_endpoint, this.adapter.origin).href;
        const pageSize = this.adapter.record_queue.page_size;
        const seen = new Set<string>();
        const orderedStages = stageProcessingOrder(domStages);
        const cursorStageIndex = cursor ? orderedStages.findIndex(stage => stage.id === cursor.stageId) : -1;
        const startStageIndex = cursorStageIndex >= 0 ? cursorStageIndex : 0;
        for (let stageIndex = startStageIndex; stageIndex < orderedStages.length; stageIndex += 1) {
            const stage = orderedStages[stageIndex]!;
            const cursorApplies = cursorStageIndex === stageIndex && cursor !== null;
            const firstPage = cursorApplies ? Math.max(1, cursor.page) : 1;
            for (let pageNo = firstPage; pageNo <= this.adapter.record_queue.safety_page_cap; pageNo += 1) {
                const formEntries = buildRecordListForm(this.adapter.record_list_url, stage.id, pageNo, pageSize);
                const result = await page.evaluate(async ({ requestUrl, entries }) => {
                    const response = await fetch(requestUrl, {
                        method: "POST",
                        credentials: "include",
                        headers: { "content-type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams(entries).toString()
                    });
                    if (!response.ok)
                        throw new Error(`companyList HTTP ${response.status}`);
                    const value = await response.json() as {
                        data?: {
                            totalItem?: number;
                            list?: Array<Record<string, unknown>>;
                        };
                    };
                    const rows = Array.isArray(value.data?.list) ? value.data!.list! : [];
                    return {
                        total: Number(value.data?.totalItem ?? rows.length),
                        rows: rows.map(row => ({
                            recordId: row.record_id === undefined || row.record_id === null ? "" : String(row.record_id),
                            name: typeof row.name === "string" ? row.name.trim() : ""
                        }))
                    };
                }, { requestUrl: endpoint, entries: formEntries });
                for (let rowIndex = 0; rowIndex < result.rows.length; rowIndex += 1) {
                    if (cursorApplies && pageNo === firstPage && rowIndex + 1 <= cursor!.row)
                        continue;
                    const candidate = result.rows[rowIndex]!;
                    if (!/^\d+$/.test(candidate.recordId) || !candidate.name || seen.has(candidate.recordId))
                        continue;
                    seen.add(candidate.recordId);
                    const completed = completedRecordIds.has(candidate.recordId);
                    if (shouldSkipCompletedCandidate(candidate.recordId, completedRecordIds, refreshCompletedRecordIds, this.refreshedCompletedRecordIds))
                        continue;
                    if (completed)
                        this.refreshedCompletedRecordIds.add(candidate.recordId);
                    return {
                        recordId: candidate.recordId,
                        name: candidate.name,
                        stageId: stage.id,
                        stageName: normalizeStageName(stage.label),
                        stageDomIndex: stage.domIndex,
                        page: pageNo,
                        row: rowIndex + 1
                    };
                }
                if (!result.rows.length || pageNo * pageSize >= result.total)
                    break;
            }
        }
        return null;
    }
    /** EN: Define the openRecord contract or operation in this module.
     * ZH: 定义本模块的 openRecord 契约或操作。 */
    async openRecord(recordId: string): Promise<Page> {
        if (!/^\d+$/.test(recordId))
            throw new Error("record_id 无效");
        const browser = await this.connect();
        const pages = browser.contexts().flatMap(context => context.pages());
        const page = await this.recordListPage() ?? pages.at(-1);
        if (!page)
            throw new Error("内置浏览器没有可用页面");
        const url = new URL(this.adapter.record_path, this.adapter.origin);
        url.searchParams.set("record_id", recordId);
        await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
        return page;
    }
    /** EN: Define the status contract or operation in this module.
     * ZH: 定义本模块的 status 契约或操作。 */
    async status(): Promise<BrowserTargetInfo> {
        const executablePath = this.embeddedMode ? process.execPath : this.findExecutable();
        if (!(await this.isEndpointAlive())) {
            return {
                mode: this.embeddedMode ? "embedded" : "external",
                connected: false, browserVersion: null, recordUrl: null, recordId: null,
                pageTitle: null, allPageCount: 0, cdpEndpoint: this.endpoint,
                profileDir: this.profileDir, executablePath
            };
        }
        try {
            const browser = await this.connect();
            const pages = browser.contexts().flatMap(context => context.pages());
            const page = pages.filter(item => parseRecordUrl(item.url(), this.adapter)).at(-1) ?? null;
            const parsed = page ? parseRecordUrl(page.url(), this.adapter) : null;
            return {
                mode: this.embeddedMode ? "embedded" : "external",
                connected: true,
                browserVersion: browser.version(),
                recordUrl: page?.url() ?? null,
                recordId: parsed?.recordId ?? null,
                pageTitle: page ? await page.title().catch(() => "") : null,
                allPageCount: pages.length,
                cdpEndpoint: this.endpoint,
                profileDir: this.profileDir,
                executablePath
            };
        }
        catch {
            return {
                mode: this.embeddedMode ? "embedded" : "external",
                connected: false, browserVersion: null, recordUrl: null, recordId: null,
                pageTitle: null, allPageCount: 0, cdpEndpoint: this.endpoint,
                profileDir: this.profileDir, executablePath
            };
        }
    }
    /** EN: Check the condition without mutating capture evidence.
     * ZH: 检查条件，不修改采集证据。 */
    private async isEndpointAlive(): Promise<boolean> {
        try {
            const response = await fetch(`${this.endpoint}/json/version`, { signal: AbortSignal.timeout(1200) });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /** EN: Define the waitForEndpoint contract or operation in this module.
     * ZH: 定义本模块的 waitForEndpoint 契约或操作。 */
    private async waitForEndpoint(timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await this.isEndpointAlive())
                return;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error(`浏览器调试端口 ${this.cdpPort} 未在 ${timeoutMs}ms 内就绪`);
    }
}
