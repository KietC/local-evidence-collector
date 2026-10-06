/** EN: Support the local collector within the explicit module scope; no live evidence is included in this source.
 * ZH: 在明确模块范围内辅助本地采集器；本源码不包含真实采集证据。 */
const $ = selector => document.querySelector(selector);
const phaseOrder = ["preflight", "root", "tabs", "mail", "documents", "reconcile"];
const desktop = window.captureDesktop || null;
let nextCandidate = null;
let nextCandidateLoading = false;
let nextCandidateCheckedAt = 0;
const marketStageLabels = { plan: "规划查询", search: "搜索候选", penetrate: "官网检索", verify: "核验证据", handoff: "生成交接", demo: "离线演示" };
const marketInputLabels = { regions: "地区", cldr: "语言映射", terms: "术语", specs: "任务规格", reviewed: "已复核公开项", customerProjection: "客户最小投影", publicEntities: "公开身份" };
const marketCountLabels = { tasks: "任务", markets: "市场", queries: "查询", candidates: "候选", records: "记录", output_records: "交接记录", network_requests: "联网请求", pattern_passes: "规则通过", held: "待复核", matched: "已匹配", needs_review: "需复核", no_match: "未匹配", verified: "已核验", reviewed: "已复核", completed: "已完成", failed: "失败", blocked: "受阻", pending: "待处理", handoffs: "交接项" };
let marketDiscoveryState = null;
let marketConnected = false;
let marketActionPending = false;
let marketStatusLoading = false;
let marketStatusGeneration = 0;
/** EN: Define the request contract or operation in this module.
 * ZH: 定义本模块的 request 契约或操作。 */
async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        body: options.body ?? (options.method === "POST" ? "{}" : undefined)
    });
    const value = await response.json();
    if (!response.ok)
        throw new Error(value.error || `HTTP ${response.status}`);
    return value;
}
/** EN: Define the escapeHtml contract or operation in this module.
 * ZH: 定义本模块的 escapeHtml 契约或操作。 */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
/** EN: Define the setBusy contract or operation in this module.
 * ZH: 定义本模块的 setBusy 契约或操作。 */
function setBusy(button, busy, label) {
    if (!button.dataset.original)
        button.dataset.original = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.original;
}
/** Read metadata only; this panel never starts a stage during refresh. */
function syncMarketControls() {
    const running = marketDiscoveryState?.running === true;
    const allowNetwork = $("#market-allow-network").checked;
    $("#market-controls").disabled = running || marketActionPending;
    document.querySelectorAll("[data-market-stage]").forEach(button => {
        const networkRequired = ["search", "penetrate"].includes(button.dataset.marketStage);
        button.disabled = !marketConnected || running || marketActionPending || (networkRequired && !allowNetwork);
        button.title = networkRequired && !allowNetwork ? "先勾选允许本次操作访问公开网站" : "";
        button.classList.toggle("active", running && button.dataset.marketStage === marketDiscoveryState.stage);
    });
    $("#market-cancel").hidden = !running;
    $("#market-cancel").disabled = marketActionPending;
}
function marketError(message = "") {
    $("#market-error").textContent = message;
    $("#market-error").hidden = !message;
}
function renderMarketDiscovery(status) {
    marketDiscoveryState = status;
    marketConnected = true;
    const running = status.running === true;
    const stage = marketStageLabels[status.stage] || "发现任务";
    const state = typeof status.status === "string" ? status.status : "idle";
    const failed = ["failed", "error", "fail"].includes(state.toLowerCase());
    const badge = $("#market-status-badge");
    badge.textContent = running ? "运行中" : failed ? "需检查" : "已就绪";
    badge.className = `status-badge ${running ? "online" : failed ? "error" : "offline"}`;
    $("#market-detail").textContent = running ? `${stage} · ${state}` : status.stage ? `${stage} · ${state}。选择阶段后手动开始。` : "尚未启动。选择阶段后手动开始。";
    $("#market-root").textContent = typeof status.root === "string" ? status.root : "尚未配置";
    const completed = status.lastCompletedAt ? new Date(status.lastCompletedAt) : null;
    const completedText = completed && Number.isFinite(completed.getTime()) ? completed.toLocaleString("zh-CN") : "尚无完成记录";
    $("#market-last-completed").textContent = `最近完成：${completedText}${typeof status.runId === "string" && status.runId ? ` · 任务 ${status.runId}` : ""}`;
    document.querySelectorAll("[data-market-input]").forEach(node => {
        const key = node.dataset.marketInput;
        const available = status.availableInputs?.[key];
        node.textContent = `${marketInputLabels[key]} ${available === true ? "✓" : available === false ? "缺少" : "—"}`;
        node.classList.toggle("ready", available === true);
        node.classList.toggle("missing", available === false);
    });
    const counts = $("#market-counts");
    counts.replaceChildren();
    if (status.counts && typeof status.counts === "object" && !Array.isArray(status.counts)) {
        Object.entries(status.counts).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) && typeof value === "number" && Number.isFinite(value) && value >= 0).slice(0, 12).forEach(([key, value]) => {
            const item = document.createElement("div");
            const label = document.createElement("dt");
            const number = document.createElement("dd");
            label.textContent = marketCountLabels[key] || key;
            number.textContent = String(value);
            item.append(label, number);
            counts.append(item);
        });
    }
    const error = typeof status.lastError === "string" ? status.lastError : typeof status.lastError?.code === "string" ? status.lastError.code : "";
    marketError(error);
    syncMarketControls();
}
async function refreshMarketDiscovery() {
    if (marketStatusLoading || marketActionPending)
        return;
    const generation = marketStatusGeneration;
    marketStatusLoading = true;
    try {
        const status = await request("/api/market-discovery/status");
        if (generation === marketStatusGeneration && !marketActionPending)
            renderMarketDiscovery(status);
    }
    catch (error) {
        if (generation === marketStatusGeneration && !marketActionPending) {
            marketConnected = false;
            $("#market-status-badge").textContent = "状态不可用";
            $("#market-status-badge").className = "status-badge error";
            marketError(`发现模块连接失败 · ${error.message}`);
            syncMarketControls();
        }
    }
    finally {
        marketStatusLoading = false;
    }
}
function marketOptions(stage) {
    const marketsInput = $("#market-markets");
    const markets = [...new Set(marketsInput.value.trim().toUpperCase().split(/[,，;；\s]+/).filter(Boolean))];
    marketsInput.setCustomValidity(markets.some(value => !/^[A-Z]{2}$/.test(value)) ? "请输入两位国家/地区代码，例如 NL, DE。" : "");
    for (const input of [marketsInput, $("#market-limit"), $("#market-concurrency")]) {
        if (!input.reportValidity())
            return null;
    }
    return { stage, allowNetwork: $("#market-allow-network").checked && ["search", "penetrate", "verify"].includes(stage), markets, limit: Number($("#market-limit").value), concurrency: Number($("#market-concurrency").value) };
}
document.querySelectorAll("[data-market-stage]").forEach(button => {
    button.addEventListener("click", async () => {
        if (marketActionPending || marketDiscoveryState?.running || button.disabled)
            return;
        const options = marketOptions(button.dataset.marketStage);
        if (!options)
            return;
        marketActionPending = true;
        marketStatusGeneration += 1;
        marketError();
        setBusy(button, true, "提交中…");
        syncMarketControls();
        try {
            await request("/api/market-discovery/start", { method: "POST", body: JSON.stringify(options) });
            // Do not reuse network consent for a later click or a later stage.
            $("#market-allow-network").checked = false;
            marketDiscoveryState = { ...marketDiscoveryState, running: true, stage: options.stage };
            renderMarketDiscovery(await request("/api/market-discovery/status"));
        }
        catch (error) {
            marketError(`无法启动发现任务 · ${error.message}`);
        }
        finally {
            marketActionPending = false;
            setBusy(button, false, "");
            syncMarketControls();
        }
    });
});
$("#market-allow-network").addEventListener("change", syncMarketControls);
$("#market-markets").addEventListener("input", () => $("#market-markets").setCustomValidity(""));
$("#market-cancel").addEventListener("click", async event => {
    if (marketActionPending || !marketDiscoveryState?.running)
        return;
    const button = event.currentTarget;
    marketActionPending = true;
    marketStatusGeneration += 1;
    setBusy(button, true, "停止中…");
    syncMarketControls();
    try {
        await request("/api/market-discovery/cancel", { method: "POST" });
        renderMarketDiscovery(await request("/api/market-discovery/status"));
    }
    catch (error) {
        marketError(`无法停止发现任务 · ${error.message}`);
    }
    finally {
        marketActionPending = false;
        setBusy(button, false, "");
        syncMarketControls();
    }
});
/** EN: Define the render contract or operation in this module.
 * ZH: 定义本模块的 render 契约或操作。 */
function render(status) {
    const { app, browser, job, autoNext = { mode: "idle", remainingMs: 0, reason: "" }, deferredRepairs = { pending: 0, pending_error: 0, pending_warning: 0 } } = status;
    $("#runtime").textContent = `采集器 #${app.instanceId || "1"} · Node ${app.node} · PID ${app.pid} · ${app.version}`;
    $("#adapter-id").textContent = `${app.adapterId} · ${app.adapterPath}`;
    $("#browser-badge").textContent = browser.connected ? "内置浏览器已接管" : "正在连接";
    $("#browser-badge").className = `status-badge ${browser.connected ? "online" : "offline"}`;
    $("#record-title").textContent = browser.recordId ? `客户 ${browser.recordId}` : browser.connected ? "请在右侧打开客户详情" : "等待内置浏览器";
    $("#record-url").textContent = browser.recordUrl || "右侧会话已持久保存；首次登录后下次自动复用";
    $("#start-capture").disabled = !browser.recordId || job.running;
    $("#launch-browser").disabled = job.running;
    $("#cancel-capture").hidden = !job.running;
    $("#job-headline").textContent = job.headline;
    $("#job-detail").textContent = job.detail;
    $("#progress-number").textContent = `${job.progress}%`;
    $("#progress-bar").style.width = `${job.progress}%`;
    $("#case-path").textContent = job.caseRoot || "尚未建立";
    $("#open-case").disabled = !job.caseRoot;
    const activeIndex = phaseOrder.indexOf(job.phase);
    document.querySelectorAll("#phase-list [data-phase]").forEach(element => {
        const index = phaseOrder.indexOf(element.dataset.phase);
        element.classList.toggle("active", index === activeIndex && job.running);
        element.classList.toggle("done", index < activeIndex || ["complete", "incomplete"].includes(job.phase));
    });
    const metricValues = [
        job.metrics.responses_observed ?? "—",
        `${job.metrics.api_rows_dynamic_mail ?? "—"} / ${job.metrics.mail_details_attempted ?? "—"}`,
        job.metrics.resources_downloaded ?? "—",
        job.metrics.reconciliation_failures ?? "—"
    ];
    document.querySelectorAll("#metrics dd").forEach((node, index) => { node.textContent = metricValues[index]; });
    $("#start-next-record").disabled = job.running || !nextCandidate;
    const reviewRequired = autoNext.mode === "review_required";
    const countdown = autoNext.mode === "countdown";
    const seconds = Math.max(0, Math.ceil(Number(autoNext.remainingMs || 0) / 1000));
    $("#cancel-auto-next").hidden = !(reviewRequired || countdown);
    $("#cancel-auto-next").textContent = countdown ? `取消自动下一个（${seconds}秒）` : "取消持续采集";
    const autoStatus = $("#auto-next-status");
    autoStatus.className = "auto-next-status";
    if (reviewRequired)
        autoStatus.textContent = autoNext.reason || "当前客户已停止，等待 Codex 匿名审计。";
    else if (countdown)
        autoStatus.textContent = `${autoNext.reason || "审计通过"}；剩余 ${seconds} 秒。`;
    else if (autoNext.mode === "capturing")
        autoStatus.textContent = "自动队列运行中：warning 和 error 都会写入本地延期修复队列，采全后统一处理。";
    else if (autoNext.mode === "opening")
        autoStatus.textContent = "正在打开下一个客户…";
    else if (autoNext.mode === "stopped_error") {
        autoStatus.textContent = autoNext.reason || "检测到 error，自动队列已停止。";
        autoStatus.classList.add("error");
    }
    else if (autoNext.mode === "stopped_user") {
        autoStatus.textContent = autoNext.reason || "自动下一个已取消。";
        autoStatus.classList.add("paused");
    }
    else if (autoNext.mode === "no_candidate")
        autoStatus.textContent = autoNext.reason || "没有待处理客户。";
    else
        autoStatus.textContent = "每次终态本地记录后等待15秒继续；采全后统一修复。";
    if (Number(deferredRepairs.pending || 0) > 0) {
        autoStatus.textContent += ` 待统一处理 ${deferredRepairs.pending} 项（error ${deferredRepairs.pending_error}，warning ${deferredRepairs.pending_warning}）。`;
    }
    const alerts = [
        ...job.errors.map(text => `<p class="error">ERROR · ${escapeHtml(text)}</p>`),
        ...job.warnings.map(text => `<p class="warning">WARN · ${escapeHtml(text)}</p>`)
    ];
    $("#alerts").innerHTML = alerts.length ? alerts.join("") : "<p>暂无告警。</p>";
}
/** EN: Define the refreshNextRecord contract or operation in this module.
 * ZH: 定义本模块的 refreshNextRecord 契约或操作。 */
async function refreshNextRecord(status, force = false) {
    if (nextCandidateLoading || status.job.running)
        return;
    if (!force && Date.now() - nextCandidateCheckedAt < 5000)
        return;
    nextCandidateLoading = true;
    nextCandidateCheckedAt = Date.now();
    try {
        const value = await request("/api/next-record");
        nextCandidate = value.candidate || null;
        $("#next-record-name").value = nextCandidate?.name || "";
        $("#next-record-name").placeholder = nextCandidate ? "" : "没有待处理客户";
        $("#next-record-meta").textContent = nextCandidate
            ? `${nextCandidate.stageName} · 第 ${nextCandidate.page} 页第 ${nextCandidate.row} 位 · cases 已有同名目录或已完整落盘客户自动跳过`
            : "全部阶段均未发现待处理客户。";
    }
    catch {
        nextCandidate = null;
        $("#next-record-name").value = "";
        $("#next-record-name").placeholder = "返回客户列表后自动计算";
        $("#next-record-meta").textContent = "顺序：客户阶段从下到上，每个阶段内从上到下；cases 已有同名目录或已完整落盘的客户自动跳过。";
    }
    finally {
        nextCandidateLoading = false;
        $("#start-next-record").disabled = status.job.running || !nextCandidate;
    }
}
/** EN: Define the refresh contract or operation in this module.
 * ZH: 定义本模块的 refresh 契约或操作。 */
async function refresh() {
    try {
        const status = await request("/api/status");
        render(status);
        await refreshNextRecord(status);
    }
    catch (error) {
        $("#alerts").innerHTML = `<p class="error">控制台连接失败 · ${escapeHtml(error.message)}</p>`;
    }
}
/** EN: Define the renderBrowserState contract or operation in this module.
 * ZH: 定义本模块的 renderBrowserState 契约或操作。 */
function renderBrowserState(state) {
    if (!state)
        return;
    $("#browser-address").value = state.url || "";
    $("#browser-back").disabled = !state.canGoBack;
    $("#browser-forward").disabled = !state.canGoForward;
    $("#browser-reload").textContent = state.loading ? "×" : "↻";
}
if (desktop) {
    document.body.classList.add("embedded");
    $("#browser-toolbar").hidden = false;
    $("#resize-handle").hidden = false;
    let sidebarWidth = 500;
    const applyLayout = state => {
        if (!state || typeof state.sidebarWidth !== "number")
            return;
        sidebarWidth = state.sidebarWidth;
        document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    };
    desktop.onLayout(applyLayout);
    applyLayout(await desktop.getLayout());
    desktop.onBrowserState(renderBrowserState);
    renderBrowserState(await desktop.getBrowserState());
    $("#browser-back").addEventListener("click", desktop.back);
    $("#browser-forward").addEventListener("click", desktop.forward);
    $("#browser-home").addEventListener("click", desktop.home);
    $("#browser-reload").addEventListener("click", desktop.reload);
    $("#sidebar-smaller").addEventListener("click", () => desktop.setSidebarWidth(sidebarWidth - 60));
    $("#sidebar-larger").addEventListener("click", () => desktop.setSidebarWidth(sidebarWidth + 60));
    const resizeHandle = $("#resize-handle");
    let drag = null;
    resizeHandle.addEventListener("pointerdown", event => {
        drag = { startX: event.clientX, startWidth: sidebarWidth };
        resizeHandle.setPointerCapture(event.pointerId);
        resizeHandle.classList.add("dragging");
        document.body.classList.add("resizing");
    });
    resizeHandle.addEventListener("pointermove", event => {
        if (!drag)
            return;
        const next = drag.startWidth + event.clientX - drag.startX;
        applyLayout({ sidebarWidth: next });
        desktop.setSidebarWidth(next);
    });
    const stopResize = event => {
        if (!drag)
            return;
        drag = null;
        if (resizeHandle.hasPointerCapture(event.pointerId))
            resizeHandle.releasePointerCapture(event.pointerId);
        resizeHandle.classList.remove("dragging");
        document.body.classList.remove("resizing");
    };
    resizeHandle.addEventListener("pointerup", stopResize);
    resizeHandle.addEventListener("pointercancel", stopResize);
    $("#browser-address-form").addEventListener("submit", event => {
        event.preventDefault();
        desktop.navigate($("#browser-address").value.trim());
    });
    $("#import-cookies").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        setBusy(button, true, "导入中…");
        try {
            const result = await desktop.importCookies();
            if (result.file)
                alert(`已从 ${result.file} 导入 ${result.imported} 条，跳过 ${result.skipped} 条。`);
        }
        catch (error) {
            alert(error.message);
        }
        finally {
            setBusy(button, false, "");
        }
    });
}
$("#launch-browser").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "正在连接…");
    try {
        if (desktop)
            desktop.home();
        await request("/api/browser/launch", { method: "POST" });
        await refresh();
    }
    catch (error) {
        alert(error.message);
    }
    finally {
        setBusy(button, false, "");
    }
});
$("#start-capture").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "任务已提交…");
    try {
        await request("/api/capture/start", { method: "POST" });
        await refresh();
    }
    catch (error) {
        alert(error.message);
    }
    finally {
        setBusy(button, false, "");
    }
});
$("#start-next-record").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "正在打开…");
    try {
        await request("/api/next-record/start", { method: "POST" });
        nextCandidate = null;
        $("#next-record-name").value = "";
        $("#next-record-name").placeholder = "正在采集当前客户";
        nextCandidateCheckedAt = 0;
        await refresh();
    }
    catch (error) {
        alert(error.message);
    }
    finally {
        setBusy(button, false, "");
    }
});
$("#cancel-capture").addEventListener("click", async () => {
    if (!confirm("停止后，已经原子落盘的数据仍会保留。确认停止？"))
        return;
    await request("/api/capture/cancel", { method: "POST" });
    await refresh();
});
$("#cancel-auto-next").addEventListener("click", async () => {
    await request("/api/auto-next/cancel", { method: "POST" });
    await refresh();
});
$("#open-case").addEventListener("click", async () => request("/api/open-case", { method: "POST" }));
void refreshMarketDiscovery();
setInterval(refreshMarketDiscovery, 2000);
await refresh();
setInterval(refresh, 1500);
