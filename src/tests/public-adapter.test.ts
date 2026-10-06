/** EN: Run synthetic regression checks without live record inputs.
 * ZH: 运行合成回归检查，不使用真实记录输入。 */
/** EN: Test the shipped generic contract with synthetic inputs and temporary files only.
 * ZH: 仅使用合成输入和临时文件测试随附通用契约。 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_ADAPTER_PATH, loadAdapter, parseRecordUrl } from "../adapter.js";
test("public adapter resolves every mandatory contract without production overrides", async () => {
    const adapter = await loadAdapter(DEFAULT_ADAPTER_PATH);
    assert.equal(adapter.adapter_id, "generic-record-demo-v1");
    assert.equal(adapter.origin, "http://127.0.0.1:4877");
    assert.equal(parseRecordUrl(`${adapter.origin}${adapter.record_path}?record_id=1001`, adapter)?.recordId, "1001");
    assert.equal(parseRecordUrl(`https://other.example.invalid${adapter.record_path}?record_id=1001`, adapter), null);
    assert.equal(parseRecordUrl(`${adapter.origin}${adapter.record_path}?record_id=invalid`, adapter), null);
    assert.ok(adapter.root_tabs.length > 0 && adapter.expected_endpoint_contracts.length > 0);
});
test("public adapter rejects malformed, restricted and cross-origin contracts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capture-adapter-fixture-"));
    try {
        const base = await loadAdapter(DEFAULT_ADAPTER_PATH);
        const fixtures = [
            { ...base, root_tabs: [...base.root_tabs, base.root_tabs[0]] },
            { ...base, record_list_url: "https://other.example.invalid/records" },
            { ...base, expected_endpoint_contracts: [{ id: "bad", method: "GET", path: "//other.example.invalid/api/items", min: 1 }] },
            { ...base, expected_endpoint_contracts: [{ id: "bad", method: "DELETE", path: "/api/records/detail", min: 1 }] },
            { ...base, expected_endpoint_contracts: [{ id: "bad", method: "GET", path: "/api/restricted/archive", min: 1 }] },
            { ...base, page_asset_hosts: [] }
        ];
        for (let index = 0; index < fixtures.length; index++) {
            const file = path.join(root, `${index}.json`);
            await fs.writeFile(file, JSON.stringify(fixtures[index]));
            await assert.rejects(loadAdapter(file));
        }
    }
    finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
