/** EN: Serve fixed synthetic loopback fixtures; health and zero-count collections are not full capture certification.
 * ZH: 提供固定本机虚构样例；健康接口和零计数集合不是全采集认证。 */
/** EN: Serve synthetic record fixtures on loopback only; no credentials or private inputs.
 * ZH: 此处解释当前操作的局部约束；保持上方英文所述的输入范围和恢复边界。 */
/** EN: Preserve the local operation's stated scope and guard condition.
 * ZH: ZH: 仅在本机提供虚构记录样例，不使用凭证或私有输入。 */
import http from "node:http";
import fs from "node:fs/promises";
const adapter = JSON.parse(await fs.readFile(new URL("../adapters/generic/v1/adapter.json", import.meta.url), "utf8"));
const send = (res, body, type = "application/json") => {
    res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", adapter.origin);
    if (url.pathname === "/healthz")
        return send(res, { status: "ok", synthetic: true });
    if (url.pathname === "/records")
        return send(res, '<!doctype html><html lang="en"><title>Synthetic records</title><h1>Synthetic records / 虚构记录</h1><a href="/records/view?record_id=1001&tab=dynamic">Demo record / 演示记录</a></html>', "text/html");
    if (url.pathname === "/records/view") {
        const tabs = adapter.root_tabs.map(tab => `<button data-tab="${tab.id}">${tab.labels[0]}</button>`).join("");
        const endpoints = [...new Set(adapter.expected_endpoint_contracts.map(item => item.path))];
        return send(res, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic record</title><h1>Demo record / 演示记录</h1><nav>${tabs}</nav><section class="record-activity-panel"><button>历史动态</button><div class="flex-1 overflow-x-auto">${adapter.dynamic.filter_labels.map(labels => `<button class="capture-btn-rect capture-btn-sm">${labels[0]} (0)</button>`).join("")}</div><p>No private records. / 不含真实记录。</p></section><script>const paths=${JSON.stringify(endpoints)}; const contracts=${JSON.stringify(adapter.expected_endpoint_contracts)}; for(const route of paths){const contract=contracts.find(c=>c.path===route);fetch(route+'?record_id=1001',{method:contract.method,headers:{'content-type':'application/json'},body:contract.method==='POST'?JSON.stringify({record_id:'1001'}):undefined}).catch(()=>{});}document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{const u=new URL(location.href);u.searchParams.set('tab',b.dataset.tab);location.href=u.href;});</script></html>`, "text/html");
    }
    if (url.pathname === "/api/records/detail")
        return send(res, { code: 0, data: { record_id: "1001", name: "Synthetic record", record_name: "Synthetic record" } });
    if (url.pathname === "/api/records/list")
        return send(res, { code: 0, data: { list: [{ record_id: "1001", name: "Synthetic record" }], totalItem: 1, total: 1 } });
    if (adapter.expected_endpoint_contracts.some(item => item.path === url.pathname)
        || [adapter.dynamic.mail_info_endpoint, adapter.dynamic.mail_track_endpoint].includes(url.pathname)) {
        return send(res, { code: 0, data: { list: [], totalItem: 0, total: 0, count: 0 } });
    }
    res.writeHead(404);
    res.end("Synthetic route not found");
});
server.listen(4877, "127.0.0.1", () => console.log("Synthetic demo: http://127.0.0.1:4877/records"));
for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit(0)));
