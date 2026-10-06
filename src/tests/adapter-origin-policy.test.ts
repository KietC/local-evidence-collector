/** EN: Support the local collector within the explicit module scope; no live evidence is included in this source.
 * ZH: 在明确模块范围内辅助本地采集器；本源码不包含真实采集证据。 */
import assert from "node:assert/strict";
import test from "node:test";
import { isCookieDomainForOrigin, isTrustedNavigationUrl, loadAdapter } from "../adapter.js";

test("desktop navigation follows the adapter origin / 桌面导航遵循适配器来源", async () => {
    const adapter = await loadAdapter();
    assert.equal(isTrustedNavigationUrl(adapter.record_list_url, adapter), true);
    assert.equal(isTrustedNavigationUrl(`${adapter.origin}/sign-in`, adapter), true);
    assert.equal(isTrustedNavigationUrl("https://elsewhere.example.test/records", adapter), false);
    const credentialed = new URL(adapter.origin);
    credentialed.username = "synthetic";
    credentialed.password = "synthetic";
    assert.equal(isTrustedNavigationUrl(credentialed.href, adapter), false);
    assert.equal(isTrustedNavigationUrl("javascript:void(0)", adapter), false);
    const custom = { ...adapter, origin: "https://portal.example.test" };
    assert.equal(isTrustedNavigationUrl("https://portal.example.test/sign-in", custom), true);
    assert.equal(isTrustedNavigationUrl("http://portal.example.test/sign-in", custom), false);
});

test("cookie imports are scoped to the adapter host / Cookie 导入限定于适配器主机", () => {
    const origin = "https://portal.example.test";
    assert.equal(isCookieDomainForOrigin("portal.example.test", origin), true);
    assert.equal(isCookieDomainForOrigin(".example.test", origin), true);
    assert.equal(isCookieDomainForOrigin(".other.test", origin), false);
    assert.equal(isCookieDomainForOrigin(".test", origin), false);
    assert.equal(isCookieDomainForOrigin("portal.example.test:443", origin), false);
    assert.equal(isCookieDomainForOrigin("", origin), false);
    assert.equal(isCookieDomainForOrigin("..example.test", origin), false);
    assert.equal(isCookieDomainForOrigin("127.0.0.1", "http://127.0.0.1:4877"), true);
});
