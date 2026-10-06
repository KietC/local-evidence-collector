/** EN: Run the downstream public-market workflow with fixed scripts and local metadata.
 * ZH: 用固定脚本运行下游公开市场流程，状态接口只返回本地元数据。 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const MARKET_STAGES = ["plan", "search", "penetrate", "verify", "handoff", "priority", "demo"] as const;
export type MarketStage = typeof MARKET_STAGES[number];
const COUNT_KEYS = new Set(["tasks", "markets", "candidates", "pattern_passes", "held", "records",
    "output_records", "matched", "needs_review", "no_match", "network_requests"]);
const INPUTS = {
    regions: "inputs/regions.csv", cldr: "inputs/cldr.xml", terms: "inputs/reviewed_terms.jsonl",
    specs: "data/search_candidate_specs.jsonl", reviewed: "inputs/approved_public.jsonl",
    customerProjection: "inputs/customer_projection.jsonl", publicEntities: "inputs/public_entities.jsonl"
};

export interface MarketStartRequest {
    stage: MarketStage;
    allowNetwork: boolean;
    markets: string[];
    limit: number;
    concurrency: number;
}
export interface MarketSnapshot {
    running: boolean;
    stage: MarketStage | null;
    status: string;
    counts: Record<string, number>;
    root: string;
    lastError: string | null;
    availableInputs: Record<string, boolean>;
    lastCompletedAt: string | null;
    runId: string | null;
}

/** EN: Validate the entire UI request before touching runtime files or starting a process.
 * ZH: 创建文件和启动进程前先校验全部界面请求。 */
export function marketRequest(value: unknown): MarketStartRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_MARKET_REQUEST");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !["stage", "allowNetwork", "markets", "limit", "concurrency"].includes(key))) {
        throw new Error("UNKNOWN_MARKET_OPTION");
    }
    if (!MARKET_STAGES.includes(row.stage as MarketStage)) throw new Error("INVALID_MARKET_STAGE");
    if (row.allowNetwork !== undefined && typeof row.allowNetwork !== "boolean") throw new Error("INVALID_NETWORK_OPTION");
    const allowNetwork = row.allowNetwork === true;
    if (["search", "penetrate"].includes(String(row.stage)) && !allowNetwork) throw new Error("NETWORK_OPT_IN_REQUIRED");
    const markets = row.markets ?? [];
    if (!Array.isArray(markets) || markets.length > 251 || markets.some(code => typeof code !== "string" || !/^[A-Z]{2}$/.test(code))) {
        throw new Error("INVALID_MARKET_CODES");
    }
    const limit = row.limit ?? 20;
    const concurrency = row.concurrency ?? 2;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) throw new Error("INVALID_MARKET_LIMIT");
    if (!Number.isInteger(concurrency) || Number(concurrency) < 1 || Number(concurrency) > 4) throw new Error("INVALID_MARKET_CONCURRENCY");
    if (allowNetwork && !["search", "penetrate", "verify"].includes(String(row.stage))) throw new Error("NETWORK_UNUSED_FOR_STAGE");
    return { stage: row.stage as MarketStage, allowNetwork, markets: [...new Set(markets)] as string[],
        limit: Number(limit), concurrency: Number(concurrency) };
}

function within(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

/** EN: Keep runtime out of tracked source and reject private case trees and link ancestors.
 * ZH: 运行目录隔离于源码，拒绝客户 case 树及链接祖先。 */
async function validateRoot(appRoot: string, runtimeRoot: string): Promise<void> {
    if (within(appRoot, runtimeRoot) && !within(path.join(appRoot, "runtime"), runtimeRoot)) {
        throw new Error("MARKET_RUNTIME_INSIDE_SOURCE");
    }
    if (runtimeRoot === path.parse(runtimeRoot).root || path.resolve(runtimeRoot) === path.resolve(appRoot)) {
        throw new Error("MARKET_RUNTIME_TOO_BROAD");
    }
    if (runtimeRoot.split(/[\\/]/).some(part => ["cases", "training_runs", "profiles", "sessions"].includes(part.toLowerCase()))) {
        throw new Error("MARKET_PRIVATE_TREE_REFUSED");
    }
    for (let current = runtimeRoot; ; current = path.dirname(current)) {
        const stat = await fs.lstat(current).catch(error => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
        if (stat?.isSymbolicLink()) throw new Error("MARKET_LINK_ANCESTOR_REFUSED");
        if (current === path.dirname(current)) break;
    }
}

export class MarketDiscovery {
    private child: ChildProcess | null = null;
    private finishing: Promise<void> | null = null;
    private completion: Promise<void> | null = null;
    private state: Omit<MarketSnapshot, "availableInputs">;
    private cancelRequested = false;
    private lockRoot: string;
    private token: string | null = null;
    private appRoot: string;
    private entry: string;

    constructor(appRoot: string, runtimeRoot: string, entry?: string) {
        this.appRoot = path.resolve(appRoot);
        this.entry = entry ?? path.join(this.appRoot, "scripts", "market-discovery.mjs");
        const root = path.resolve(runtimeRoot);
        this.lockRoot = path.join(root, ".controller-lock");
        this.state = { root, running: false, stage: null, status: "IDLE", counts: {}, lastError: null,
            lastCompletedAt: null, runId: null };
    }

    async snapshot(): Promise<MarketSnapshot> {
        await validateRoot(this.appRoot, this.state.root);
        const availableInputs: Record<string, boolean> = {};
        for (const [key, relative] of Object.entries(INPUTS)) {
            const file = path.join(this.state.root, relative);
            const stat = await fs.lstat(file).catch(() => null);
            availableInputs[key] = !!stat?.isFile() && !stat.isSymbolicLink();
        }
        if (this.state.running && this.state.stage) await this.refreshReceipt(false);
        return { ...this.state, counts: { ...this.state.counts }, availableInputs };
    }

    async start(value: unknown, captureContext?: { jobRef: string; phase: string }): Promise<MarketSnapshot> {
        const request = marketRequest(value);
        if (this.child || this.finishing || this.state.running) throw new Error("MARKET_ALREADY_RUNNING");
        await validateRoot(this.appRoot, this.state.root);
        await fs.mkdir(this.state.root, { recursive: true });
        try { await fs.mkdir(this.lockRoot); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("MARKET_RUNTIME_BUSY");
            throw error;
        }
        this.token = crypto.randomUUID();
        try {
            await fs.writeFile(path.join(this.lockRoot, "owner.json"), JSON.stringify({
                schema: 1, token: this.token, controller_pid: process.pid, acquired_at: new Date().toISOString()
            }), { flag: "wx" });
            const runId = crypto.randomUUID();
            this.cancelRequested = false;
            this.state = { ...this.state, running: true, stage: request.stage, status: "RUNNING", counts: {},
                lastError: null, runId };
            if (captureContext) {
                await fs.mkdir(path.join(this.state.root, "capture-links"), { recursive: true });
                await fs.writeFile(path.join(this.state.root, "capture-links", `${runId}.json`), JSON.stringify({
                    schema: 1, run_id: runId, capture_job_ref: captureContext.jobRef, capture_phase: captureContext.phase,
                    public_fields_read: false, linked_at: new Date().toISOString()
                }), { flag: "wx" });
            }
            const args = [this.entry, `--root=${this.state.root}`, `--stage=${request.stage}`, `--run-id=${runId}`,
                `--limit=${request.limit}`, `--concurrency=${request.concurrency}`];
            if (request.markets.length) args.push(`--markets=${request.markets.join(",")}`);
            if (request.allowNetwork) args.push("--allow-network");
            const child = spawn(process.execPath, args, { cwd: this.appRoot, shell: false, windowsHide: true,
                stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
            this.child = child;
            let complete!: () => void;
            this.completion = new Promise<void>(resolve => { complete = resolve; });
            let ended = false;
            const terminal = (code: number | null, error: string | null) => {
                if (ended) return;
                ended = true;
                this.finishing = this.finish(code, error).finally(() => {
                    this.finishing = null;
                    this.completion = null;
                    complete();
                });
            };
            child.once("error", () => terminal(null, "MARKET_PROCESS_START_FAILED"));
            child.once("close", code => terminal(code, null));
            return await this.snapshot();
        } catch (error) {
            this.child = null;
            this.state.running = false;
            this.state.status = "FAILED";
            this.state.lastError = "MARKET_START_FAILED";
            await this.release();
            throw error;
        }
    }

    private async refreshReceipt(terminal: boolean): Promise<boolean> {
        if (!this.state.stage || !this.state.runId) return false;
        const file = path.join(this.state.root, "stages", this.state.stage, `${this.state.runId}.json`);
        try {
            const stat = await fs.lstat(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return false;
            const row = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
            if (row.schema !== "market_discovery.stage_receipt.v1" || row.stage !== this.state.stage || row.run_id !== this.state.runId) return false;
            const allowedStatus = ["RUNNING", "COMPLETE", "PARTIAL", "BLOCKED", "FAILED", "CANCELLED"];
            if (!allowedStatus.includes(String(row.status))) return false;
            const counts: Record<string, number> = {};
            if (row.counts && typeof row.counts === "object") {
                for (const [key, value] of Object.entries(row.counts)) {
                    if (COUNT_KEYS.has(key) && Number.isSafeInteger(value) && Number(value) >= 0) counts[key] = Number(value);
                }
            }
            this.state.counts = counts;
            if (terminal) {
                this.state.status = String(row.status);
                this.state.lastError = typeof row.error_code === "string" && /^[A-Z0-9_]{1,80}$/.test(row.error_code) ? row.error_code : null;
            }
            return true;
        } catch { return false; }
    }

    private async finish(code: number | null, error: string | null): Promise<void> {
        const dispatcherPid = this.child?.pid;
        try {
            const receipt = await this.refreshReceipt(true);
            if (this.cancelRequested) this.state.status = "CANCELLED";
            else if (error || code !== 0) {
                this.state.status = "FAILED";
                this.state.lastError ??= error ?? "MARKET_STAGE_FAILED";
            } else if (!receipt || this.state.status === "RUNNING") {
                this.state.status = "FAILED";
                this.state.lastError = "MARKET_TERMINAL_RECEIPT_MISSING";
            }
        } finally {
            this.state.lastCompletedAt = new Date().toISOString();
            // EN: A force-stopped owned dispatcher cannot run its finally block.
            // ZH: 强制停止的自有编排进程无法执行 finally，只清理精确归属的锁。
            if (dispatcherPid && this.state.runId) {
                const lock = path.join(this.state.root, ".market-discovery.lock");
                try {
                    const info = await fs.lstat(lock);
                    if (info.isFile() && !info.isSymbolicLink()) {
                        const owner = JSON.parse(await fs.readFile(lock, "utf8")) as { pid?: number; run_id?: string };
                        if (owner.pid === dispatcherPid && owner.run_id === this.state.runId) await fs.unlink(lock);
                    }
                } catch { /* EN: Leave other owners untouched. ZH: 不改动其他进程的锁。 */ }
            }
            await this.release();
            this.child = null;
            this.state.running = false;
        }
    }

    private async release(): Promise<void> {
        if (!this.token) return;
        const owner = path.join(this.lockRoot, "owner.json");
        try {
            const row = JSON.parse(await fs.readFile(owner, "utf8")) as { token?: string };
            if (row.token === this.token) {
                await fs.unlink(owner);
                await fs.rmdir(this.lockRoot);
            }
        } catch { /* EN: Preserve a conflicting/unknown owner. ZH: 保留身份不明或冲突的锁。 */ }
        this.token = null;
    }

    async cancel(): Promise<void> {
        const child = this.child;
        const completion = this.completion;
        if (!child || child.exitCode !== null) {
            await completion;
            return;
        }
        this.cancelRequested = true;
        if (process.platform === "win32" && child.pid) {
            await execFileAsync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 }).catch(() => child.kill());
        } else child.kill("SIGTERM");
        // EN: Shutdown must await terminal receipt handling and exact-owner lock release.
        // ZH: 退出前等待终态处理及精确归属锁释放，避免重启后被遗留锁阻断。
        await completion;
    }
}
