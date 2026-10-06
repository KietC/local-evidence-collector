/** EN: Exercise downstream process ownership, contracts and actual synthetic output.
 * ZH: 验证下游进程归属、参数契约以及真实生成的合成输出。 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MarketDiscovery, marketRequest } from "../market-discovery.js";

const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function idle(worker: MarketDiscovery): Promise<Awaited<ReturnType<MarketDiscovery["snapshot"]>>> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const state = await worker.snapshot();
        if (!state.running) return state;
        await pause(40);
    }
    await worker.cancel();
    throw new Error("synthetic market stage timeout");
}

test("market contract rejects arbitrary commands and requires explicit network selection", () => {
    assert.throws(() => marketRequest({ stage: "shell", command: "example" }), /OPTION|STAGE/);
    assert.throws(() => marketRequest({ stage: "search" }), /NETWORK_OPT_IN/);
    assert.throws(() => marketRequest({ stage: "plan", allowNetwork: "true" }), /NETWORK_OPTION/);
    assert.throws(() => marketRequest({ stage: "plan", markets: ["US;other"] }), /MARKET_CODES/);
    assert.throws(() => marketRequest({ stage: "plan", concurrency: 99 }), /CONCURRENCY/);
    assert.throws(() => marketRequest({ stage: "plan", limit: 10000 }), /LIMIT/);
    assert.deepEqual(marketRequest({ stage: "plan", markets: ["US", "US"] }), {
        stage: "plan", allowNetwork: false, markets: ["US"], limit: 20, concurrency: 2
    });
});

test("market runtime refuses tracked source and private case locations before writes", async () => {
    const sourceWorker = new MarketDiscovery(APP_ROOT, path.join(APP_ROOT, "src", "unsafe-market"));
    await assert.rejects(sourceWorker.start({ stage: "plan" }), /INSIDE_SOURCE/);
    const privateWorker = new MarketDiscovery(APP_ROOT, path.join(os.tmpdir(), "cases", "unsafe-market"));
    await assert.rejects(privateWorker.start({ stage: "plan" }), /PRIVATE_TREE/);
});

test("synthetic demo connects collector controller to local plan, evidence gates and handoff", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "collector-market-demo-"));
    const worker = new MarketDiscovery(APP_ROOT, root);
    try {
        const started = await worker.start({ stage: "demo" }, { jobRef: "a".repeat(64), phase: "complete" });
        assert.ok(started.runId);
        const terminal = await idle(worker);
        assert.equal(terminal.status, "COMPLETE", terminal.lastError ?? "demo did not complete");
        assert.ok((terminal.counts.output_records ?? terminal.counts.records ?? 0) > 0);
        const receipt = JSON.parse(await fs.readFile(path.join(root, "stages", "demo", `${terminal.runId}.json`), "utf8"));
        assert.equal(receipt.synthetic_only, true);
        assert.equal(receipt.network_allowed, false);
        const linked = JSON.parse(await fs.readFile(path.join(root, "capture-links", `${terminal.runId}.json`), "utf8"));
        assert.equal(linked.public_fields_read, false);
        assert.equal(linked.capture_job_ref, "a".repeat(64));
        await assert.rejects(fs.stat(path.join(root, ".controller-lock")), { code: "ENOENT" });
    } finally {
        await worker.cancel();
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("a shared runtime has one controller owner and cancel releases its own process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "collector-market-owner-"));
    const entry = path.join(root, "synthetic-worker.mjs");
    await fs.writeFile(entry, "setInterval(() => {}, 1000);\n");
    const first = new MarketDiscovery(APP_ROOT, root, entry);
    const second = new MarketDiscovery(APP_ROOT, root, entry);
    try {
        await first.start({ stage: "plan" });
        await assert.rejects(second.start({ stage: "plan" }), /RUNTIME_BUSY/);
        await assert.rejects(first.start({ stage: "plan" }), /ALREADY_RUNNING/);
        await first.cancel();
        const cancelled = await first.snapshot();
        assert.equal(cancelled.running, false, "cancel must await the owned process and lock cleanup");
        assert.equal(cancelled.status, "CANCELLED");
        await assert.rejects(fs.stat(path.join(root, ".controller-lock")), { code: "ENOENT" });
    } finally {
        await first.cancel();
        await second.cancel();
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("a missing terminal receipt cannot turn process exit zero into complete", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "collector-market-no-receipt-"));
    const entry = path.join(root, "synthetic-exit.mjs");
    await fs.writeFile(entry, "process.exit(0);\n");
    const worker = new MarketDiscovery(APP_ROOT, root, entry);
    try {
        await worker.start({ stage: "plan" });
        const terminal = await idle(worker);
        assert.equal(terminal.status, "FAILED");
        assert.equal(terminal.lastError, "MARKET_TERMINAL_RECEIPT_MISSING");
    } finally {
        await worker.cancel();
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("market HTTP controls reject malformed bodies without echo and do not auto-run", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "collector-market-http-"));
    const listener = net.createServer();
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    const child = spawn(process.execPath, [path.join(APP_ROOT, "dist", "server.js")], {
        cwd: APP_ROOT, stdio: "ignore", windowsHide: true, env: { ...process.env,
            CAPTURE_CAPTURE_PORT: String(port), CAPTURE_QUEUE_COORDINATOR: "0",
            CAPTURE_RUNTIME_ROOT: root, CAPTURE_SHARED_RUNTIME_ROOT: root,
            CAPTURE_OUTPUT_ROOT: path.join(root, "synthetic-data"), MARKET_DISCOVERY_ROOT: path.join(root, "market") }
    });
    const origin = `http://127.0.0.1:${port}`;
    try {
        for (let attempt = 0; attempt < 100; attempt++) {
            const ready = await fetch(`${origin}/healthz`).then(response => response.ok).catch(() => false);
            if (ready) break;
            assert.equal(child.exitCode, null);
            await pause(50);
        }
        const initial = await fetch(`${origin}/api/market-discovery/status`).then(response => response.json()) as { running: boolean };
        assert.equal(initial.running, false);
        for (const route of ["start", "cancel"]) {
            const response = await fetch(`${origin}/api/market-discovery/${route}`, { method: "POST",
                headers: { "content-type": "application/json" }, body: '{"synthetic-private-marker":broken}' });
            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), { error: "MARKET_BODY_INVALID_JSON" });
        }
        const crossOrigin = await fetch(`${origin}/api/market-discovery/start`, { method: "POST",
            headers: { origin: "https://example.invalid", "content-type": "application/json" }, body: '{"stage":"demo"}' });
        assert.equal(crossOrigin.status, 403);
        const network = await fetch(`${origin}/api/market-discovery/start`, { method: "POST",
            headers: { "content-type": "application/json" }, body: '{"stage":"search"}' });
        assert.equal(network.status, 400);
        assert.deepEqual(await network.json(), { error: "NETWORK_OPT_IN_REQUIRED" });
        await assert.rejects(fs.stat(path.join(root, "market", ".controller-lock")), { code: "ENOENT" });
    } finally {
        if (child.exitCode === null) {
            const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
            child.kill("SIGTERM");
            await closed;
        }
        await fs.rm(root, { recursive: true, force: true });
    }
});
