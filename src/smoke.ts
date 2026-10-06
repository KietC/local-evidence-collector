/** EN: Verify shipped source assets and synthetic adapter URL parsing without live capture.
 * ZH: 验证随附资源和合成适配器 URL 解析，不执行真实采集。 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ADAPTER_PATH, loadAdapter, parseRecordUrl } from "./adapter.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const adapter = await loadAdapter();
const problems: string[] = [];
for (const required of [
    path.join(appRoot, "ui", "index.html"),
    path.join(appRoot, "ui", "app.js"),
    path.join(appRoot, "ui", "styles.css"),
    path.resolve(process.env.CAPTURE_ADAPTER_PATH ?? DEFAULT_ADAPTER_PATH)
]) {
    try {
        await fs.access(required);
    }
    catch {
        problems.push(`missing: ${required}`);
    }
}
const sampleUrl = new URL(adapter.record_path, adapter.origin);
sampleUrl.searchParams.set("record_id", "123456");
const sample = parseRecordUrl(sampleUrl.href, adapter);
if (sample?.recordId !== "123456")
    problems.push("record URL parser failed");
sampleUrl.searchParams.set("record_id", "abc");
if (parseRecordUrl(sampleUrl.href, adapter))
    problems.push("invalid record id accepted");
sampleUrl.pathname = `${adapter.record_path}/outside-scope`;
sampleUrl.searchParams.set("record_id", "123");
if (parseRecordUrl(sampleUrl.href, adapter))
    problems.push("out-of-scope path accepted");
if (problems.length) {
    process.stderr.write(`${JSON.stringify({ status: "failed", problems }, null, 2)}\n`);
    process.exit(1);
}
process.stdout.write(`${JSON.stringify({
    status: "passed",
    adapter: adapter.adapter_id,
    rootTabs: adapter.root_tabs.length,
    endpointContracts: adapter.expected_endpoint_contracts.length
}, null, 2)}\n`);
