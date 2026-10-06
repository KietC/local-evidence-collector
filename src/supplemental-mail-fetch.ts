/** EN: Fetch explicitly bound supplemental messages using exact local manifests.
 * ZH: 根据精确本地清单补采明确绑定的消息。 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";
import { DEFAULT_ADAPTER_PATH, loadAdapter, parseRecordUrl } from "./adapter.js";
import { BrowserManager } from "./browser-manager.js";
import { validateMailApiResponse } from "./capture-engine.js";
import { sha256, stamp } from "./evidence-store.js";
type JsonObject = Record<string, unknown>;
/** EN: Define the ArtifactRef contract or operation in this module.
 * ZH: 定义本模块的 ArtifactRef 契约或操作。 */
interface ArtifactRef {
    path: string;
    bytes: number;
    sha256: string;
}
/** EN: Define the SupplementalTargetManifest contract or operation in this module.
 * ZH: 定义本模块的 SupplementalTargetManifest 契约或操作。 */
interface SupplementalTargetManifest {
    schema: "capture.crm.supplemental_mail_targets.v1";
    status: "PASS_SUPPLEMENTAL_MAIL_TARGETS";
    generated_at: string;
    record_key: string;
    record_id: string;
    source: {
        relationship_messages: ArtifactRef;
        message_sources: ArtifactRef;
        base_capture_manifest: ArtifactRef;
    };
    counts: {
        unresolved_rows: number;
        matched_source_rows: number;
        unique_mail_targets: number;
    };
    targets: string[];
}
/** EN: Define the SyntheticResult contract or operation in this module.
 * ZH: 定义本模块的 SyntheticResult 契约或操作。 */
interface SyntheticResult {
    status: number;
    url: string;
    contentType: string;
    base64: string;
    error: string | null;
}
/** EN: Define the SupplementalMailRow contract or operation in this module.
 * ZH: 定义本模块的 SupplementalMailRow 契约或操作。 */
interface SupplementalMailRow {
    mail_id: string;
    detail_status: "AVAILABLE" | "SOURCE_DELETED" | "UNAVAILABLE";
    validation_reason: string;
    attempts: number;
    source_identity_sha256: string;
    artifact: ArtifactRef | null;
}
/** EN: Reject inputs that violate this operation's contract.
 * ZH: 拒绝违反本操作契约的输入。 */
function requiredArg(args: Map<string, string>, name: string): string {
    const value = args.get(name);
    if (!value)
        throw new Error(`missing required argument --${name}`);
    return value;
}
/** EN: Read or normalize the supplied structure while preserving explicit identity.
 * ZH: 读取或规范化提供的结构，并保留明确身份。 */
function parseArgs(argv: string[]): {
    command: string;
    values: Map<string, string>;
} {
    const command = argv[0] ?? "";
    const values = new Map<string, string>();
    for (let index = 1; index < argv.length; index += 2) {
        const rawName = argv[index];
        const value = argv[index + 1];
        if (!rawName?.startsWith("--") || value === undefined)
            throw new Error(`invalid argument near ${rawName ?? "<end>"}`);
        values.set(rawName.slice(2), value);
    }
    return { command, values };
}
/** EN: Derive this helper value from the supplied inputs.
 * ZH: 从提供的输入生成本辅助值。 */
async function sha256File(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    for await (const chunk of createReadStream(filePath))
        hash.update(chunk as Buffer);
    return hash.digest("hex");
}
/** EN: Define the artifactRef contract or operation in this module.
 * ZH: 定义本模块的 artifactRef 契约或操作。 */
async function artifactRef(filePath: string): Promise<ArtifactRef> {
    const stat = await fs.stat(filePath);
    if (!stat.isFile())
        throw new Error(`artifact is not a file: ${filePath}`);
    return { path: path.resolve(filePath), bytes: stat.size, sha256: await sha256File(filePath) };
}
/** EN: Define the forEachJsonl contract or operation in this module.
 * ZH: 定义本模块的 forEachJsonl 契约或操作。 */
async function forEachJsonl(filePath: string, visit: (row: JsonObject) => void): Promise<void> {
    const input = createReadStream(filePath, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of lines) {
        lineNumber += 1;
        if (!line.trim())
            continue;
        let value: unknown;
        try {
            value = JSON.parse(line);
        }
        catch {
            throw new Error(`invalid JSONL at line ${lineNumber}: ${filePath}`);
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`JSONL row is not an object at line ${lineNumber}: ${filePath}`);
        }
        visit(value as JsonObject);
    }
}
/** EN: Persist the supplied local artifact according to this module's storage contract.
 * ZH: 按本模块存储契约保存提供的本地产物。 */
async function writeExclusive(filePath: string, data: Buffer | string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data, { flag: "wx" });
}
/** EN: Read or normalize the supplied structure while preserving explicit identity.
 * ZH: 读取或规范化提供的结构，并保留明确身份。 */
function normalizeSha(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized))
        throw new Error("SHA-256 must contain exactly 64 hexadecimal characters");
    return normalized;
}
/** EN: Define the numericId contract or operation in this module.
 * ZH: 定义本模块的 numericId 契约或操作。 */
function numericId(value: unknown): string | null {
    const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    return /^\d+$/.test(id) && id !== "0" ? id : null;
}
/** EN: Define the jsonObject contract or operation in this module.
 * ZH: 定义本模块的 jsonObject 契约或操作。 */
function jsonObject(value: unknown, label: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value as JsonObject;
}
/** EN: Define the prepare contract or operation in this module.
 * ZH: 定义本模块的 prepare 契约或操作。 */
async function prepare(values: Map<string, string>): Promise<JsonObject> {
    const relationshipMessages = path.resolve(requiredArg(values, "relationship-messages"));
    const messageSources = path.resolve(requiredArg(values, "message-sources"));
    const baseCaptureManifest = path.resolve(requiredArg(values, "base-capture-manifest"));
    const expectedBaseSha = normalizeSha(requiredArg(values, "base-capture-sha256"));
    const recordKey = requiredArg(values, "record-key").trim();
    const output = path.resolve(requiredArg(values, "output"));
    if (!recordKey)
        throw new Error("record key is empty");
    const baseRef = await artifactRef(baseCaptureManifest);
    if (baseRef.sha256.toLowerCase() !== expectedBaseSha)
        throw new Error("base capture manifest SHA-256 mismatch");
    const base = jsonObject(JSON.parse(await fs.readFile(baseCaptureManifest, "utf8")), "base capture manifest");
    if (base.status !== "PASS" || base.schema !== "capture.crm.mail_capture_manifest.v2") {
        throw new Error("base capture manifest is not a PASS v2 manifest");
    }
    const recordId = numericId(base.record_id);
    if (!recordId)
        throw new Error("base capture manifest has no valid record_id");
    const unresolvedSourceIds = new Set<string>();
    await forEachJsonl(relationshipMessages, row => {
        if (row.direct_header_status !== "UNRESOLVED_PARENT")
            return;
        const sourceId = typeof row.source_id === "string" ? row.source_id : "";
        if (!sourceId)
            throw new Error("unresolved relationship row has no source_id");
        if (unresolvedSourceIds.has(sourceId))
            throw new Error("duplicate unresolved relationship source_id");
        unresolvedSourceIds.add(sourceId);
    });
    if (!unresolvedSourceIds.size)
        throw new Error("no UNRESOLVED_PARENT rows found");
    const targets = new Set<string>();
    const matched = new Set<string>();
    await forEachJsonl(messageSources, row => {
        const sourceId = typeof row.source_id === "string" ? row.source_id : "";
        if (!unresolvedSourceIds.has(sourceId))
            return;
        if (matched.has(sourceId))
            throw new Error("message source contains duplicate unresolved source_id");
        matched.add(sourceId);
        const hints = Array.isArray(row.parent_hints) ? row.parent_hints : [];
        const crmTargets = hints.flatMap(hint => {
            if (!hint || typeof hint !== "object" || Array.isArray(hint))
                return [];
            const item = hint as JsonObject;
            if (item.namespace !== "CRM_MAIL_ID")
                return [];
            const id = numericId(item.value);
            return id ? [id] : [];
        });
        if (!crmTargets.length)
            throw new Error("unresolved source row has no CRM_MAIL_ID parent hint");
        crmTargets.forEach(id => targets.add(id));
    });
    if (matched.size !== unresolvedSourceIds.size)
        throw new Error("unresolved relationship rows did not map one-to-one to message sources");
    const manifest: SupplementalTargetManifest = {
        schema: "capture.crm.supplemental_mail_targets.v1",
        status: "PASS_SUPPLEMENTAL_MAIL_TARGETS",
        generated_at: new Date().toISOString(),
        record_key: recordKey,
        record_id: recordId,
        source: {
            relationship_messages: await artifactRef(relationshipMessages),
            message_sources: await artifactRef(messageSources),
            base_capture_manifest: baseRef
        },
        counts: {
            unresolved_rows: unresolvedSourceIds.size,
            matched_source_rows: matched.size,
            unique_mail_targets: targets.size
        },
        targets: [...targets].sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    };
    const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeExclusive(output, encoded);
    return {
        status: manifest.status,
        output,
        bytes: Buffer.byteLength(encoded),
        sha256: sha256(encoded),
        counts: manifest.counts,
        stdout_policy: "metadata_only"
    };
}
/** EN: Reject inputs that violate this operation's contract.
 * ZH: 拒绝违反本操作契约的输入。 */
function validateTargetManifest(value: unknown): SupplementalTargetManifest {
    const manifest = jsonObject(value, "target manifest") as unknown as SupplementalTargetManifest;
    if (manifest.schema !== "capture.crm.supplemental_mail_targets.v1" || manifest.status !== "PASS_SUPPLEMENTAL_MAIL_TARGETS") {
        throw new Error("invalid supplemental target manifest schema or status");
    }
    if (!numericId(manifest.record_id) || typeof manifest.record_key !== "string" || !manifest.record_key) {
        throw new Error("invalid supplemental target record binding");
    }
    if (!Array.isArray(manifest.targets) || !manifest.targets.length)
        throw new Error("supplemental target list is empty");
    const normalized = manifest.targets.map(numericId);
    if (normalized.some(id => !id))
        throw new Error("supplemental target list contains an invalid mail_id");
    const uniqueTargets = new Set(normalized as string[]);
    if (uniqueTargets.size !== normalized.length)
        throw new Error("supplemental target list contains duplicate mail_id values");
    if (manifest.counts?.unique_mail_targets !== normalized.length)
        throw new Error("supplemental target count mismatch");
    const source = jsonObject(manifest.source, "target source binding");
    const base = jsonObject(source.base_capture_manifest, "base capture binding");
    normalizeSha(String(base.sha256 ?? ""));
    return manifest;
}
/** EN: Define the pageFetch contract or operation in this module.
 * ZH: 定义本模块的 pageFetch 契约或操作。 */
async function pageFetch(page: Page, exactUrl: string): Promise<SyntheticResult> {
    return page.evaluate(async (innerUrl) => {
        try {
            const url = new URL(innerUrl, location.origin);
            if (url.origin !== location.origin)
                throw new Error("cross-origin supplemental fetch is not allowed");
            const response = await fetch(url.href, { method: "GET", credentials: "include", cache: "no-store" });
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            return {
                status: response.status,
                url: response.url,
                contentType: response.headers.get("content-type") ?? "application/octet-stream",
                base64: btoa(binary),
                error: response.ok ? null : `HTTP ${response.status}`
            };
        }
        catch (error) {
            return {
                status: 0,
                url: new URL(innerUrl, location.origin).href,
                contentType: "application/octet-stream",
                base64: "",
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }, exactUrl);
}
/** EN: Check the condition without mutating capture evidence.
 * ZH: 检查条件，不修改采集证据。 */
function shouldRetry(status: number, reason: string): boolean {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
        || ["transport_error", "invalid_json_object", "missing_data"].includes(reason);
}
/** EN: Collect or recover the scoped artifact using the surrounding capture policy.
 * ZH: 依据当前采集策略收集或恢复范围内产物。 */
async function fetchOne(page: Page, endpoint: string, mailId: string, maxAttempts: number, objectDirectory: string, caseRoot: string): Promise<SupplementalMailRow> {
    const exactUrl = new URL(endpoint);
    exactUrl.searchParams.set("mail_id", mailId);
    let finalResult: SyntheticResult | null = null;
    let reason = "not_attempted";
    let attempts = 0;
    for (attempts = 1; attempts <= maxAttempts; attempts += 1) {
        finalResult = await pageFetch(page, exactUrl.href);
        let json: unknown = null;
        if (finalResult.base64) {
            try {
                json = JSON.parse(Buffer.from(finalResult.base64, "base64").toString("utf8"));
            }
            catch {
                json = null;
            }
        }
        const validation = validateMailApiResponse(finalResult.status, finalResult.error, json, mailId, "detail");
        reason = validation.reason;
        if (validation.valid || !shouldRetry(finalResult.status, reason) || attempts === maxAttempts)
            break;
        await new Promise(resolve => setTimeout(resolve, 300 * attempts));
    }
    if (!finalResult)
        throw new Error("supplemental fetch produced no result");
    const body = finalResult.base64 ? Buffer.from(finalResult.base64, "base64") : Buffer.alloc(0);
    let artifact: ArtifactRef | null = null;
    if (body.byteLength) {
        const digest = sha256(body);
        const objectPath = path.join(objectDirectory, `${digest}.bin`);
        try {
            await fs.writeFile(objectPath, body, { flag: "wx" });
        }
        catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST")
                throw error;
            const existing = await fs.readFile(objectPath);
            if (!existing.equals(body))
                throw new Error("content-addressed supplemental artifact collision");
        }
        artifact = { path: path.relative(caseRoot, objectPath), bytes: body.byteLength, sha256: digest };
    }
    const valid = validateMailApiResponse(finalResult.status, finalResult.error, body.byteLength ? (() => { try {
        return JSON.parse(body.toString("utf8"));
    }
    catch {
        return null;
    } })() : null, mailId, "detail");
    return {
        mail_id: mailId,
        detail_status: valid.reason === "source_deleted" ? "SOURCE_DELETED" : valid.valid ? "AVAILABLE" : "UNAVAILABLE",
        validation_reason: valid.reason,
        attempts,
        source_identity_sha256: sha256(exactUrl.href),
        artifact
    };
}
/** EN: Collect or recover the scoped artifact using the surrounding capture policy.
 * ZH: 依据当前采集策略收集或恢复范围内产物。 */
async function fetchTargets(values: Map<string, string>): Promise<JsonObject> {
    const targetPath = path.resolve(requiredArg(values, "target-manifest"));
    const expectedTargetSha = normalizeSha(requiredArg(values, "target-sha256"));
    const targetBytes = await fs.readFile(targetPath);
    if (sha256(targetBytes).toLowerCase() !== expectedTargetSha)
        throw new Error("supplemental target manifest SHA-256 mismatch");
    const target = validateTargetManifest(JSON.parse(targetBytes.toString("utf8")));
    const basePath = path.resolve(requiredArg(values, "base-capture-manifest"));
    const baseRef = await artifactRef(basePath);
    if (baseRef.sha256.toLowerCase() !== target.source.base_capture_manifest.sha256.toLowerCase()) {
        throw new Error("base capture manifest no longer matches the target binding");
    }
    const base = jsonObject(JSON.parse(await fs.readFile(basePath, "utf8")), "base capture manifest");
    if (base.status !== "PASS" || base.schema !== "capture.crm.mail_capture_manifest.v2")
        throw new Error("base capture is not PASS v2");
    if (String(base.record_id ?? "") !== target.record_id)
        throw new Error("target and base capture record_id mismatch");
    const baseSessionId = typeof base.session_id === "string" ? base.session_id : "";
    if (!baseSessionId)
        throw new Error("base capture has no session_id");
    if (path.basename(path.dirname(basePath)).toLowerCase() !== "manifests") {
        throw new Error("base capture manifest must be inside the case manifests directory");
    }
    const caseRoot = path.dirname(path.dirname(basePath));
    const controlPort = Number(values.get("control-port") ?? "3211");
    const controlResponse = await fetch(`http://127.0.0.1:${controlPort}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (!controlResponse.ok)
        throw new Error(`collector control status HTTP ${controlResponse.status}`);
    const control = jsonObject(await controlResponse.json(), "collector control status");
    const job = jsonObject(control.job, "collector job status");
    const browserStatus = jsonObject(control.browser, "collector browser status");
    if (job.running === true)
        throw new Error("collector capture is running; supplemental fetch refused");
    if (browserStatus.connected !== true)
        throw new Error("collector browser is not connected");
    const cdpEndpoint = new URL(String(browserStatus.cdpEndpoint ?? ""));
    if (cdpEndpoint.hostname !== "127.0.0.1" && cdpEndpoint.hostname !== "localhost") {
        throw new Error("collector CDP endpoint is not local-only");
    }
    const cdpPort = Number(values.get("cdp-port") ?? cdpEndpoint.port);
    if (!Number.isFinite(cdpPort) || cdpPort <= 0)
        throw new Error("invalid collector CDP port");
    const concurrency = Math.min(4, Math.max(1, Number(values.get("concurrency") ?? "2")));
    const maxAttempts = Math.min(5, Math.max(1, Number(values.get("max-attempts") ?? "3")));
    const adapter = await loadAdapter();
    const browserManager = new BrowserManager(cdpPort, path.join(caseRoot, ".unused-profile"), adapter);
    let page = await browserManager.recordPage();
    const current = page ? parseRecordUrl(page.url(), adapter) : null;
    if (!current || current.recordId !== target.record_id)
        page = await browserManager.openRecord(target.record_id);
    if (!page)
        throw new Error("collector browser has no usable page");
    const activePage = page;
    const parsed = parseRecordUrl(activePage.url(), adapter);
    if (!parsed || parsed.recordId !== target.record_id)
        throw new Error("collector browser did not enter the bound record page");
    const parent = path.join(caseRoot, "raw", "supplemental_sessions");
    await fs.mkdir(parent, { recursive: true });
    const sessionId = `supplement_${stamp()}_${crypto.randomBytes(3).toString("hex")}`;
    const sessionRoot = path.join(parent, sessionId);
    await fs.mkdir(sessionRoot, { recursive: false });
    const objectDirectory = path.join(sessionRoot, "objects");
    await fs.mkdir(objectDirectory, { recursive: false });
    await writeExclusive(path.join(sessionRoot, "session.json"), `${JSON.stringify({
        schema: "capture.crm.supplemental_mail_session.v1",
        status: "STARTED",
        started_at: new Date().toISOString(),
        session_id: sessionId,
        record_id: target.record_id,
        base_capture_session_id: baseSessionId,
        target_manifest_sha256: expectedTargetSha
    }, null, 2)}\n`);
    const rows: SupplementalMailRow[] = [];
    let cursor = 0;
    const endpoint = new URL(adapter.dynamic.mail_info_endpoint, adapter.origin).href;
    await Promise.all(Array.from({ length: Math.min(concurrency, target.targets.length) }, async () => {
        for (;;) {
            const index = cursor++;
            if (index >= target.targets.length)
                return;
            rows[index] = await fetchOne(activePage, endpoint, target.targets[index]!, maxAttempts, objectDirectory, caseRoot);
        }
    }));
    const available = rows.filter(row => row.detail_status === "AVAILABLE").length;
    const sourceDeleted = rows.filter(row => row.detail_status === "SOURCE_DELETED").length;
    const unavailable = rows.filter(row => row.detail_status === "UNAVAILABLE").length;
    const manifest = {
        schema: "capture.crm.supplemental_mail_capture_manifest.v1",
        status: unavailable === 0 ? "PASS_SUPPLEMENTAL_MAIL_CAPTURE" : "INCOMPLETE_SUPPLEMENTAL_MAIL_CAPTURE",
        generated_at: new Date().toISOString(),
        session_id: sessionId,
        record_id: target.record_id,
        base_capture_session_id: baseSessionId,
        target_manifest: { path: targetPath, sha256: expectedTargetSha },
        counts: { requested: rows.length, available, source_deleted: sourceDeleted, unavailable },
        mails: rows
    };
    const manifestPath = path.join(sessionRoot, "supplemental_mail_capture_manifest.private.json");
    const manifestEncoded = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeExclusive(manifestPath, manifestEncoded);
    const manifestRef = await artifactRef(manifestPath);
    const receipt = {
        schema: "capture.crm.supplemental_mail_fetch_receipt.v1",
        status: unavailable === 0 ? "PASS_SUPPLEMENTAL_MAIL_FETCH" : "INCOMPLETE_SUPPLEMENTAL_MAIL_FETCH",
        generated_at: new Date().toISOString(),
        session_id: sessionId,
        bindings: {
            target_manifest: { path: targetPath, sha256: expectedTargetSha },
            base_capture_manifest: baseRef,
            base_capture_session_id: baseSessionId,
            adapter: await artifactRef(DEFAULT_ADAPTER_PATH)
        },
        counts: manifest.counts,
        execution: {
            control_port: controlPort,
            cdp_port: cdpPort,
            concurrency,
            max_attempts: maxAttempts,
            model_calls: 0,
            original_pass_capture_modified: false,
            stdout_policy: "metadata_only"
        },
        output: manifestRef
    };
    const receiptPath = path.join(sessionRoot, "SUPPLEMENTAL_MAIL_FETCH_RECEIPT.json");
    const receiptEncoded = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeExclusive(receiptPath, receiptEncoded);
    return {
        status: receipt.status,
        session_root: sessionRoot,
        receipt: receiptPath,
        receipt_sha256: sha256(receiptEncoded),
        manifest: manifestPath,
        manifest_sha256: manifestRef.sha256,
        counts: manifest.counts,
        original_pass_capture_modified: false,
        stdout_policy: "metadata_only"
    };
}
/** EN: Enter this lifecycle operation using the configured local scope.
 * ZH: 在配置的本地范围内进入此生命周期操作。 */
export async function runSupplementalMailFetch(argv: string[]): Promise<JsonObject> {
    const { command, values } = parseArgs(argv);
    if (command === "prepare")
        return prepare(values);
    if (command === "fetch")
        return fetchTargets(values);
    throw new Error("usage: supplemental-mail-fetch <prepare|fetch> --name value ...");
}
const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
    void runSupplementalMailFetch(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`, () => process.exit(0)), error => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        process.stderr.write(`${JSON.stringify({ status: "FAILED", error: message, stdout_policy: "metadata_only" })}\n`, () => process.exit(1));
    });
}
