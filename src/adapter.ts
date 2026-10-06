/** EN: Validate adapter contracts and constrain capture URL scope.
 * ZH: 验证适配器契约并限制采集 URL 范围。 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptureAdapter } from "./types.js";
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_ADAPTER_PATH = path.join(APP_ROOT, "adapters", "generic", "v1", "adapter.json");
/** EN: Bind desktop navigation to the configured origin, never to a shipped vendor host.
 * ZH: 将桌面导航绑定到配置的来源，不绑定内置供应商域名。 */
export function isTrustedNavigationUrl(rawUrl: string, adapter: CaptureAdapter): boolean {
    try {
        const url = new URL(rawUrl);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            && url.origin === adapter.origin;
    }
    catch {
        return false;
    }
}
/** EN: Import only cookies applicable to the configured host; Chromium still enforces cookie rules.
 * ZH: 仅导入适用于配置主机的 Cookie；Chromium 继续执行 Cookie 规则。 */
export function isCookieDomainForOrigin(rawDomain: string, origin: string): boolean {
    try {
        const domain = rawDomain.replace(/^\./, "").toLowerCase();
        const host = new URL(origin).hostname.toLowerCase();
        if (!domain || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain))
            return false;
        return host === domain || (domain.includes(".") && host.endsWith(`.${domain}`));
    }
    catch {
        return false;
    }
}
/** EN: Keep explicitly restricted routes out of automatic capture, including recovery.
 * ZH: 将明确受限的路由排除在自动采集和恢复之外。 */
export function isAutoCaptureExcludedUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl, "http://127.0.0.1:4877");
        const pathname = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
        return (pathname === "/records/view" && url.searchParams.get("tab")?.toLowerCase() === "restricted")
            || pathname === "/restricted/archive" || pathname.startsWith("/restricted/archive/")
            || pathname === "/api/restricted/archive" || pathname.startsWith("/api/restricted/archive/")
            || pathname === "/api/restricted/insights" || pathname.startsWith("/api/restricted/insights/");
    }
    catch {
        return false;
    }
}
/** EN: Load and validate a public demo adapter or an operator-supplied local adapter.
 * ZH: 加载并验证公开演示适配器或操作者提供的本地适配器。 */
export async function loadAdapter(adapterPath = process.env.CAPTURE_ADAPTER_PATH ?? DEFAULT_ADAPTER_PATH): Promise<CaptureAdapter> {
    const value: unknown = JSON.parse(await fs.readFile(adapterPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid capture adapter");
    const adapter = value as CaptureAdapter;
    let origin: URL;
    try {
        origin = new URL(adapter.origin);
    }
    catch {
        throw new Error("Invalid adapter origin");
    }
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password
        || origin.origin !== adapter.origin || adapter.schema !== 1
        || !adapter.record_path?.startsWith("/") || !adapter.root_tabs?.length
        || !Array.isArray(adapter.expected_endpoint_contracts)
        || !Array.isArray(adapter.page_asset_hosts) || !adapter.page_asset_hosts.length
        || !Array.isArray(adapter.external_ai_blocked_hosts)
        || !adapter.record_queue || !adapter.dynamic || !adapter.documents || !adapter.known_count_paths) {
        throw new Error("Invalid capture adapter contract");
    }
    if (new URL(adapter.record_list_url, adapter.origin).origin !== adapter.origin)
        throw new Error("Cross-origin record list refused");
    const ids = adapter.root_tabs.map(tab => tab.id);
    if (new Set(ids).size !== ids.length || adapter.root_tabs.some(tab => !tab.id || !tab.labels?.length || tab.id.toLowerCase() === "restricted")) {
        throw new Error("Invalid or restricted root tabs");
    }
    for (const contract of adapter.expected_endpoint_contracts) {
        if (!contract.id || !contract.path?.startsWith("/") || contract.path.startsWith("//")
            || !["GET", "POST"].includes(contract.method) || !Number.isInteger(contract.min) || contract.min < 0
            || new URL(contract.path, adapter.origin).origin !== adapter.origin
            || isAutoCaptureExcludedUrl(new URL(contract.path, adapter.origin).href)) {
            throw new Error("Invalid, cross-origin or restricted endpoint contract");
        }
    }
    return adapter;
}
/** EN: Accept only the configured record page with a numeric record identifier.
 * ZH: 仅接受配置中的记录详情页和数字记录标识。 */
export function parseRecordUrl(rawUrl: string, adapter: CaptureAdapter): {
    recordId: string;
    url: URL;
} | null {
    try {
        const url = new URL(rawUrl);
        if (url.origin !== adapter.origin || url.pathname !== adapter.record_path || url.username || url.password)
            return null;
        const recordId = url.searchParams.get("record_id") ?? "";
        return /^\d+$/.test(recordId) ? { recordId, url } : null;
    }
    catch {
        return null;
    }
}
/** EN: Block configured external AI hosts and their subdomains.
 * ZH: 阻断配置中的外部 AI 域名及其子域名。 */
export function isBlockedAiUrl(rawUrl: string, adapter: CaptureAdapter): boolean {
    try {
        const host = new URL(rawUrl).hostname.toLowerCase();
        return adapter.external_ai_blocked_hosts.some(item => host === item || host.endsWith(`.${item}`));
    }
    catch {
        return false;
    }
}
/** EN: Limit ordinary resource discovery to the configured asset host list.
 * ZH: 将普通资源发现限制在配置的资源域名白名单内。 */
export function isAllowedCaptureUrl(rawUrl: string, adapter: CaptureAdapter): boolean {
    try {
        const url = new URL(rawUrl);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            && adapter.page_asset_hosts.some(item => url.hostname === item || url.hostname.endsWith(`.${item}`));
    }
    catch {
        return false;
    }
}
/** EN: Exclude common telemetry endpoints from evidence recovery.
 * ZH: 将常见遥测端点排除在证据恢复之外。 */
export function isTelemetryUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl), host = url.hostname.toLowerCase(), pathname = url.pathname.toLowerCase();
        return host.includes("sensorsdata") || host === "hm.baidu.com" || host.endsWith(".hm.baidu.com")
            || host === "www.google-analytics.com" || host.endsWith(".google-analytics.com")
            || host === "www.googletagmanager.com" || host.endsWith(".googletagmanager.com")
            || host.includes("arms-retcode") || host.endsWith("log.aliyuncs.com")
            || pathname === "/sa.gif" || pathname.includes("/logstores/") || pathname.includes("/trace/track");
    }
    catch {
        return false;
    }
}
/** EN: Recover only observed HTTP GET resources; never enumerate new endpoints here.
 * ZH: 仅恢复已经观察到的 HTTP GET 资源；此处不枚举新端点。 */
export function isSafeObservedGetRecoveryUrl(rawUrl: string, adapter: CaptureAdapter): boolean {
    try {
        const url = new URL(rawUrl);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            && !isBlockedAiUrl(url.href, adapter) && !isTelemetryUrl(url.href) && !isAutoCaptureExcludedUrl(url.href);
    }
    catch {
        return false;
    }
}
