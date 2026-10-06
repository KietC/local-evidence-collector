/** EN: Support the local collector within the explicit module scope; no live evidence is included in this source.
 * ZH: 在明确模块范围内辅助本地采集器；本源码不包含真实采集证据。 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compatibleEvidencePath, EvidenceStore, MAX_ATOMIC_PATH_CHARS, MAX_EVIDENCE_PATH_CHARS, sha256, sourceUrlIdentityKey } from "../evidence-store.js";
test("signed object URLs share an identity while transforms stay distinct", () => {
    const first = "https://assets.example.invalid/files/example.pdf?Expires=1&Signature=old";
    const rotated = "https://assets.example.invalid/files/example.pdf?Expires=2&Signature=new";
    const transformed = `${rotated}&x-oss-process=image/resize,w_100`;
    assert.equal(sourceUrlIdentityKey(first), sourceUrlIdentityKey(rotated));
    assert.notEqual(sourceUrlIdentityKey(rotated), sourceUrlIdentityKey(transformed));
});
test("concurrent stores never share a seconds-level session directory", () => {
    const rootUrl = "http://127.0.0.1:4877/records/view?record_id=9000000000004";
    const first = new EvidenceStore("C:\\workspace", "9000000000004", rootUrl, "Case", "Case");
    const second = new EvidenceStore("C:\\workspace", "9000000000004", rootUrl, "Case", "Case");
    assert.notEqual(first.sessionId, second.sessionId);
    assert.match(first.sessionId, /^capture_\d{8}T\d{6}Z_\d+_[0-9a-f]{6}$/);
});
test("case identity is created once and a same-company resume never overwrites it", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-case-identity-"));
    const recordId = "9000000000004";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}`;
    const identityPath = path.join(workspace, "cases", "Immutable Case", "case_identity.json");
    try {
        const first = new EvidenceStore(workspace, recordId, rootUrl, "Immutable Case", "Immutable Case");
        await first.initialize("test-adapter");
        const original = await fs.readFile(identityPath);
        const originalStat = await fs.stat(identityPath);
        await new Promise(resolve => setTimeout(resolve, 20));
        const resumed = new EvidenceStore(workspace, recordId, `${rootUrl}&tab=history`, "Renamed Label", "Immutable Case");
        await resumed.initialize("test-adapter-v2");
        assert.deepEqual(await fs.readFile(identityPath), original);
        assert.equal((await fs.stat(identityPath)).mtimeMs, originalStat.mtimeMs);
        const parsed = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
        assert.equal(parsed.record_id, recordId);
        assert.equal(parsed.record_name, "Immutable Case");
        assert.equal(typeof parsed.created_at, "string");
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("case identity collision fails closed without modifying the existing owner", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-case-collision-"));
    const folder = "Shared Label";
    const firstId = "111111";
    const secondId = "222222";
    const firstUrl = `http://127.0.0.1:4877/records/view?record_id=${firstId}`;
    const secondUrl = `http://127.0.0.1:4877/records/view?record_id=${secondId}`;
    const identityPath = path.join(workspace, "cases", folder, "case_identity.json");
    try {
        const first = new EvidenceStore(workspace, firstId, firstUrl, folder, folder);
        await first.initialize("test-adapter");
        const original = await fs.readFile(identityPath);
        const collision = new EvidenceStore(workspace, secondId, secondUrl, folder, folder);
        await assert.rejects(collision.initialize("test-adapter"), /拒绝混写/);
        assert.deepEqual(await fs.readFile(identityPath), original);
        const sessions = await fs.readdir(path.join(workspace, "cases", folder, "raw", "sessions"));
        assert.deepEqual(sessions, [first.sessionId]);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("failed HTTP bodies never enter the reusable source index", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-failed-source-"));
    const rootUrl = "http://127.0.0.1:4877/records/view?record_id=9000000000004";
    const expired = "https://assets.example.invalid/files/example.pdf?Expires=1&Signature=expired";
    try {
        const first = new EvidenceStore(workspace, "9000000000004", rootUrl, "Failed Source", "Failed Source");
        await first.initialize("test-adapter");
        await first.storeResponse({
            sequence: 1, method: "GET", url: expired, status: 403,
            resourceType: "discovered_file", mimeType: "application/xml",
            body: Buffer.from("<Error>Expired</Error>"), error: "HTTP 403"
        });
        await first.writeDedupSummary();
        const second = new EvidenceStore(workspace, "9000000000004", rootUrl, "Failed Source", "Failed Source");
        await second.initialize("test-adapter");
        const reused = await second.reuseResponseByUrl({
            sequence: 2, method: "GET",
            url: "https://assets.example.invalid/files/example.pdf?Expires=2&Signature=fresh",
            resourceType: "discovered_file"
        });
        assert.equal(reused, null);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("BMP magic overrides a misleading PNG URL and empty bodies are not reusable", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-media-magic-"));
    const rootUrl = "http://127.0.0.1:4877/records/view?record_id=9000000000004";
    const url = "https://assets.example.invalid/files/image.png?Expires=1&Signature=old";
    try {
        const first = new EvidenceStore(workspace, "9000000000004", rootUrl, "Media Magic", "Media Magic");
        await first.initialize("test-adapter");
        const bmp = await first.storeResponse({
            sequence: 1, method: "GET", url, status: 200,
            resourceType: "discovered_file", mimeType: "image/png",
            body: Buffer.concat([Buffer.from("BM"), Buffer.alloc(32)]), error: null
        });
        assert.ok(bmp.bodyRelativePath?.endsWith(".bmp"));
        const emptyUrl = "https://assets.example.invalid/files/empty.png?Expires=1&Signature=old";
        const empty = await first.storeResponse({
            sequence: 2, method: "GET", url: emptyUrl, status: 200,
            resourceType: "discovered_file", mimeType: "image/png",
            body: Buffer.alloc(0), error: null
        });
        assert.ok(empty.bodyRelativePath?.endsWith(".empty.bin"));
        await first.writeDedupSummary();
        const second = new EvidenceStore(workspace, "9000000000004", rootUrl, "Media Magic", "Media Magic");
        await second.initialize("test-adapter");
        assert.equal(await second.reuseResponseByUrl({ sequence: 3, method: "GET", url: emptyUrl, resourceType: "discovered_file" }), null);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("legacy Office and archive magic override misleading modern or generic metadata", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-office-magic-"));
    const rootUrl = "http://127.0.0.1:4877/records/view?record_id=9000000000004";
    try {
        const store = new EvidenceStore(workspace, "9000000000004", rootUrl, "Format Test", "Format Test");
        await store.initialize("test-adapter");
        const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
        const legacyWorkbook = await store.storeResponse({
            sequence: 1, method: "GET", url: "https://assets.example.test/report.xlsx", status: 200,
            resourceType: "discovered_file", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            body: ole, error: null
        });
        assert.ok(legacyWorkbook.bodyRelativePath?.endsWith(".xls"));
        const sevenZip = Buffer.concat([Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), Buffer.alloc(64)]);
        const archive = await store.storeResponse({
            sequence: 2, method: "GET", url: "https://assets.example.test/download.bin", status: 200,
            resourceType: "discovered_file", mimeType: "application/octet-stream", body: sevenZip, error: null
        });
        assert.ok(archive.bodyRelativePath?.endsWith(".7z"));
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
async function allFiles(root: string): Promise<string[]> {
    const output: string[] = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop()!;
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory())
                pending.push(full);
            else if (entry.isFile())
                output.push(full);
        }
    }
    return output;
}
test("相同内容复用 SHA-256 对象，下一次采集按来源 URL 跳过重复下载", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-dedup-"));
    const recordId = "9000000000006";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}&tab=dynamic`;
    const fileUrl = "https://objects.example.invalid/files/example.pdf?Expires=1&Signature=old";
    const body = Buffer.from("stable-local-evidence");
    try {
        const first = new EvidenceStore(workspace, recordId, rootUrl, "Example Record", "Example Record");
        await first.initialize("test-adapter");
        const one = await first.storeResponse({
            sequence: 1, method: "GET", url: fileUrl, status: 200,
            resourceType: "discovered_file", mimeType: "application/pdf", body, error: null
        });
        const two = await first.storeResponse({
            sequence: 2, method: "GET", url: `${fileUrl}?mirror=1`, status: 200,
            resourceType: "discovered_file", mimeType: "application/pdf", body, error: null
        });
        assert.equal(one.bodySha256, sha256(body));
        assert.equal(two.bodyRelativePath, one.bodyRelativePath);
        assert.equal(first.dedupStats().objects_reused, 1);
        await first.storePage("snapshot", rootUrl, "<html>snapshot</html>", "snapshot text", Buffer.from("snapshot image"));
        assert.equal(first.dedupStats().objects_written, 5);
        await first.writeDedupSummary();
        const second = new EvidenceStore(workspace, recordId, rootUrl, "Example Record", "Example Record");
        await second.initialize("test-adapter");
        const reused = await second.reuseResponseByUrl({
            sequence: 1, method: "GET",
            url: "https://objects.example.invalid/files/example.pdf?Expires=2&Signature=new&response-content-disposition=inline",
            resourceType: "discovered_file"
        });
        assert.ok(reused);
        assert.equal(reused.bodySha256, sha256(body));
        assert.equal(second.dedupStats().downloads_skipped, 1);
        assert.equal(second.dedupStats().download_bytes_avoided, body.byteLength);
        await second.writeDedupSummary();
        const manifests = path.join(workspace, "cases", "Example Record", "manifests");
        const hashLines = (await fs.readFile(path.join(manifests, "sha256_index.jsonl"), "utf8")).trim().split("\n");
        const sourceLines = (await fs.readFile(path.join(manifests, "source_url_index.jsonl"), "utf8")).trim().split("\n");
        assert.equal(hashLines.length, second.dedupStats().hash_index_entries);
        assert.equal(sourceLines.length, second.dedupStats().source_url_index_entries);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("已落盘 JSON 响应可按精确来源复用并仅按需解析", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-json-reuse-"));
    const recordId = "9000000000004";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}`;
    const apiUrl = "http://127.0.0.1:4877/api/messages/info?mail_id=987";
    try {
        const first = new EvidenceStore(workspace, recordId, rootUrl, "JSON Reuse", "JSON Reuse");
        await first.initialize("test-adapter");
        await first.storeResponse({
            sequence: 1, method: "GET", url: apiUrl, status: 200,
            resourceType: "xhr", mimeType: "text/plain", body: Buffer.from('{"code":0,"data":{"ok":true}}'), error: null
        });
        await first.writeDedupSummary();
        const second = new EvidenceStore(workspace, recordId, rootUrl, "JSON Reuse", "JSON Reuse");
        await second.initialize("test-adapter");
        const reused = await second.reuseResponseByUrl({
            sequence: 2, method: "GET", url: apiUrl, resourceType: "xhr", parseJson: true
        });
        assert.ok(reused);
        assert.deepEqual(reused.json, { code: 0, data: { ok: true } });
        assert.equal(second.dedupStats().downloads_skipped, 1);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("超长 URL、请求路径和页面标签始终压缩到 Windows 兼容路径上限", async () => {
    const directory = path.join("runtime", "c".repeat(145), "objects");
    const compact = compatibleEvidencePath(directory, `0000001__${"endpoint".repeat(40)}.pdf`, "a".repeat(64));
    assert.ok(compact.length <= MAX_EVIDENCE_PATH_CHARS);
    assert.ok(`${compact}.12345678.tmp`.length <= MAX_ATOMIC_PATH_CHARS);
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-path-limit-"));
    const recordId = "9000000000004";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}`;
    try {
        const store = new EvidenceStore(workspace, recordId, rootUrl, "Path Limit Test", "Path Limit Test");
        await store.initialize("test-adapter");
        const longUrl = `https://assets.example.test/${"very-long-segment/".repeat(30)}manual.pdf`;
        const response = await store.storeResponse({
            sequence: 1, method: "GET", url: longUrl, status: 200,
            resourceType: "discovered_file", mimeType: "application/pdf", body: Buffer.from("pdf"), error: null
        });
        const request = await store.storeRequestBody(2, "POST", `http://127.0.0.1:4877/api/${"long/".repeat(50)}submit`, Buffer.from("request"));
        await store.storePage("标签".repeat(200), rootUrl, "<html></html>", "text", Buffer.from("image"));
        assert.ok(path.join(store.caseRoot, response.bodyRelativePath!).length <= MAX_EVIDENCE_PATH_CHARS);
        assert.ok(path.join(store.caseRoot, request).length <= MAX_EVIDENCE_PATH_CHARS);
        const files = await allFiles(store.caseRoot);
        assert.ok(files.length > 0);
        assert.ok(Math.max(...files.map((file) => file.length)) <= MAX_EVIDENCE_PATH_CHARS);
        assert.equal(files.some((file) => file.endsWith(".tmp")), false);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("离线页面自包含且原始 DOM 单独标记，图片扩展名按真实魔数", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-offline-page-"));
    const recordId = "9000000000007";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}`;
    try {
        const store = new EvidenceStore(workspace, recordId, rootUrl, "Offline Test", "Offline Test");
        await store.initialize("test-adapter");
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
        await store.storePage("详情", rootUrl, "<html><script src='/app.js'></script></html>", "离线文字", jpeg, "From: snapshot.mhtml\r\n");
        const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from("payload")]);
        const image = await store.storeResponse({
            sequence: 2, method: "GET", url: "https://assets.example.test/logo.gif", status: 200,
            resourceType: "image", mimeType: "image/webp", body: webp, error: null
        });
        assert.ok(image.bodyRelativePath?.endsWith(".webp"));
        const pages = await allFiles(path.join(store.sessionRoot, "pages"));
        const viewer = pages.find((file) => file.endsWith(".html"));
        const dom = pages.find((file) => file.endsWith(".dom.rawhtml"));
        const mhtml = pages.find((file) => file.endsWith(".mhtml"));
        assert.ok(viewer);
        assert.ok(dom);
        assert.ok(mhtml);
        const viewerText = await fs.readFile(viewer!, "utf8");
        assert.match(viewerText, /data:image\/jpeg;base64,/);
        assert.doesNotMatch(viewerText, /<script\b|<link\b[^>]*href=/i);
        const screenshots = await allFiles(path.join(store.sessionRoot, "screenshots"));
        assert.equal(screenshots.some((file) => file.endsWith(".jpg")), true);
        const htmlResponse = await store.storeResponse({
            sequence: 3, method: "GET", url: "http://127.0.0.1:4877/mail/view", status: 200,
            resourceType: "document", mimeType: "text/html; charset=utf-8",
            body: Buffer.from("<html><script src='https://external.invalid/a.js'></script><body>本地正文</body></html>"), error: null
        });
        assert.ok(htmlResponse.bodyRelativePath?.endsWith(".response.rawhtml"));
        const objects = await allFiles(path.join(store.sessionRoot, "objects"));
        const responseViewer = objects.find((file) => file.endsWith(".html"));
        assert.ok(responseViewer);
        const responseViewerText = await fs.readFile(responseViewer!, "utf8");
        assert.doesNotMatch(responseViewerText, /<script\b[^>]*src=/i);
        assert.match(responseViewerText, /Content-Security-Policy/);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
test("并发大响应写入 JSONL 时逐行串行化且全部可解析", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "capture-jsonl-gate-"));
    const recordId = "9000000000008";
    const rootUrl = `http://127.0.0.1:4877/records/view?record_id=${recordId}`;
    try {
        const store = new EvidenceStore(workspace, recordId, rootUrl, "JSONL Test", "JSONL Test");
        await store.initialize("test-adapter");
        const count = 20;
        await Promise.all(Array.from({ length: count }, (_, index) => {
            const separators = ["\u0085", "\u2028", "\u2029"];
            const body = Buffer.from(JSON.stringify({ index, payload: `${index}:${separators[index % separators.length]}`.padEnd(128 * 1024, "x") }));
            return store.storeResponse({
                sequence: index + 1, method: "GET", url: `http://127.0.0.1:4877/api/test/${index}`, status: 200,
                resourceType: "xhr", mimeType: "application/json", body, error: null
            });
        }));
        const responses = path.join(store.sessionRoot, "network", "responses.jsonl");
        const responseText = await fs.readFile(responses, "utf8");
        assert.doesNotMatch(responseText, /[\u0085\u2028\u2029]/u);
        const lines = responseText.trim().split("\n");
        assert.equal(lines.length, count);
        assert.equal(lines.every((line) => { try {
            JSON.parse(line);
            return true;
        }
        catch {
            return false;
        } }), true);
    }
    finally {
        await fs.rm(workspace, { recursive: true, force: true });
    }
});
