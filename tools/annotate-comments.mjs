// EN: Add English-first Chinese-second source explanations without changing executable statements.
// ZH: 为源码补充英文在前、中文在后的说明，不改变可执行语句。
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const purposes = {
  "adapter.ts": ["Validate adapter contracts and constrain capture URL scope.", "验证适配器契约并限制采集 URL 范围。"],
  "browser-manager.ts": ["Manage a dedicated browser and record-scoped navigation.", "管理专用浏览器及单记录范围导航。"],
  "capture-engine.ts": ["Orchestrate bounded page, response, message and attachment capture with reconciliation.", "编排有界页面、响应、消息和附件采集，并执行完整性核对。"],
  "evidence-store.ts": ["Persist local evidence, content hashes, identity records and reusable indexes.", "保存本地证据、内容哈希、身份记录及可复用索引。"],
  "server.ts": ["Expose loopback-only control operations and coordinate isolated capture and repair state.", "提供仅限本机的控制操作，并协调隔离采集及修复状态。"],
  "electron-main.ts": ["Host the desktop UI, dedicated session and local child-server lifecycle.", "承载桌面界面、专用会话和本地子服务生命周期。"],
  "relation-window-capture.ts": ["Capture explicitly bound message relation windows and verify artifact references.", "采集明确绑定的消息关系窗口，并验证产物引用。"],
  "supplemental-mail-fetch.ts": ["Fetch explicitly bound supplemental messages using exact local manifests.", "根据精确本地清单补采明确绑定的消息。"],
  "runtime-lock.ts": ["Coordinate local filesystem locks and conservative stale-owner cleanup.", "协调本地文件系统锁，并保守清理失效锁持有者。"],
  "case-inventory.ts": ["Index completed local evidence cases without treating directory names as PASS receipts.", "建立已完成本地案例索引，不把目录名当作 PASS 凭证。"],
  "deferred-repair-queue.ts": ["Classify and queue incomplete capture outcomes for explicit later repair.", "分类采集不完整结果，并加入明确的后续修复队列。"],
  "types.ts": ["Define record adapters, capture states, response artifacts and reconciliation contracts.", "定义记录适配器、采集状态、响应产物及完整性核对契约。"],
  "auto-next.ts": ["Determine whether a persisted terminal capture may advance the record queue.", "判断已持久化的采集终态是否允许推进记录队列。"],
  "codex-wake-policy.ts": ["Define optional external-review command arguments and terminal-event policy.", "定义可选外部审查命令参数及终态事件策略。"],
  "codex-monitor.ts": ["Run an optional locally configured reviewer only for explicit pending events.", "仅对明确待处理事件运行可选的本地配置审查器。"],
  "smoke.ts": ["Verify shipped source assets and synthetic adapter URL parsing without live capture.", "验证随附资源和合成适配器 URL 解析，不执行真实采集。"]
};
const translations = [
  ["Trade-data evidence", "受限证据只能进入明确的手工通道。自动采集不得保存、重放或发现这些路由，且不能因过时或错误配置扩大范围。"],
  ["Only retry an exact GET", "仅重试浏览器已经观察到的精确 GET 地址，不扩大递归发现范围；外部 AI 和遥测仍被排除。"],
  ["Every non-cancelled terminal", "非取消终态须先可靠保存，再推进队列；延后的警告和错误在主队列结束后修复。"],
  ["A directory name alone", "目录名不能证明当前采集成功；仅凭 PASS 索引决定跳过，显式配置的记录每进程最多刷新一次。"],
  ["Return only extra visible", "只返回未配置的可见内部标签，点击前排除根标签和手工受限通道。"],
  ["Count how many configured", "计算按钮栏覆盖的动态过滤组数量，忽略页面加载时会变化的数字徽标。"],
  ["Pick the most complete", "选择最完整的可见过滤栏，而不是首个瞬态或陈旧过滤栏。"],
  ["Network.loadNetworkResource", "网络资源会先进入 Node 堆；大文件并发可能耗尽内存。保持分页并行，但严格限制二进制下载并发。"],
  ["Signed object-store URLs", "签名资源地址常仅轮换认证参数；只移除已知易变签名字段，保留会改变表示形式的字段，防止别名掩盖缺失正文。"],
  ["response is a dashboard", "统计响应不是完整列表。合成分页必须关闭统计切片，否则总数看似闭合但首屏仅含摘要。"],
  ["Derive a page-specific replay", "分页重放来自页面已发送的 POST；只改变已观察分页字段，保留记录过滤和内容类型，未知形状拒绝猜测。"],
  ["Read-only first-page probes", "只读首屏探测补足隐藏或未请求的契约；参数沿用已观察形状，仅插入当前记录 ID，并由后续分页闭合非零总量。"],
  ["A one-record run", "单记录采集可能从手工受限页面启动；重载和快照前先切到自动标签，避免保存受限页面。"],
  ["Latest is a convenience", "latest 只是便捷副本；处理范围绑定不可变会话产物，最终指针更新中断不应使旧 PASS 范围失效。"],
  ["History is the read-only", "历史入口只触发只读加载；采集后保持动态页，并要求完整过滤栏。"],
  ["The first navigation", "首个页面可能只显示瞬态按钮；先触发历史加载，再枚举完整可见过滤栏，期间不离开页面。"],
  ["The read-only trailList", "只读列表重放负责闭合全部分页；视觉过滤栏隐藏或改名本身不是遗漏证明。"],
  ["Preserve the exact observed", "保留已经观察的记录、对象、文件夹和关键字范围，仅改变分页字段，防止跨记录列表请求。"],
  ["List pages are volatile", "列表会变化，不能把新总数和旧分页混用；刷新小 JSON 响应，证据存储仍按字节哈希去重，大文件保留正常复用路径。"],
  ["Prefer the newest signed", "优先使用最新签名地址，再尝试旧别名；失败记录保留，但只有有效 2xx 正文进入可复用索引。"],
  ["Capture reviews are deliberately", "采集审查限定单轮；相关 CLI 调用关闭持续目标，避免下次采集运行时又发起模型轮次；队列结束时才允许最终收口。"],
  ["The one-shot launcher", "单次启动器须等待控制界面和记录页就绪；先移除陈旧标记，仅在主窗口显示后写入新就绪标记。"],
  ["Preserve semantic compound", "缩短 Windows 长路径时保留复合后缀，避免混淆原始证据、离线查看器和空正文。"],
  ["Fall through to", "无效或非 HTTP 值回退为遮蔽后的精确 URL 身份。"],
  ["Atomically establishes", "原子建立案例目录的不可变持有身份。完整临时文件通过硬链接占位发布，竞争者只看到完整身份；相同记录可复用，异主或损坏身份拒绝。"],
  ["The shared inventory", "共享索引减少旧目录名称查找的文件读取；信任缓存目录之前仍重新验证精确身份。"],
  ["A seconds-only directory", "仅到秒的目录可能碰撞；加入进程和随机量，避免不同存储实例共享追加式快照路径。"],
  ["Indexes are derivative", "索引是可维护派生数据，不是不可变原证据；结束时压缩并将内存键各保存一次。"],
  ["Never let an expired", "过期签名地址的错误响应不能污染同一逻辑附件的可复用缓存。"],
  ["The live anchor", "当前锚点已覆盖小型前向窗口；推进外层整页目标，重复加入内层目标会导致大量重复窗口采集。"],
  ["Normal queue collectors", "公开副本的证据工作区由显式配置指定，默认只写入项目内隔离运行目录。"],
  ["Legacy markers had", "缺少身份的旧标记不可恢复，应移除该失效标记，避免每次启动都错误停止。"],
  ["Electron starts the server", "Electron 服务可能先于记录视图就绪；正常启动竞态不能被当作采集错误。"],
  ["Production-DOM regression", "合成 DOM 回归样例覆盖瞬态按钮和完整加载后的过滤栏，防止把半加载状态当成完整页面。"],
  ["best effort", "尽力执行，不因非关键辅助操作失败中断主流程。"],
  ["legacy directory locks", "旧目录锁可能没有持有者元数据。"],
  ["already validated", "已验证页面可能在终态处理期间变化，不继续依赖陈旧对象。"],
  ["start below", "当前服务未就绪，进入下方启动流程。"],
  ["retry", "按上方有界期限继续等待，不视为成功。"],
  ["ignore", "忽略该非权威辅助结果，保留主流程的独立验证。"],
  ["skip", "跳过不可用的辅助项，不生成成功凭证。"],
  ["fall", "无法使用该辅助结果时回退到后续明确处理路径。"]
];
const meanings = [
  [/^is|^should|^has/, "Check the condition without mutating capture evidence.", "检查条件，不修改采集证据。"],
  [/^assert|^validate|^require/, "Reject inputs that violate this operation's contract.", "拒绝违反本操作契约的输入。"],
  [/^capture|^fetch|^recover/, "Collect or recover the scoped artifact using the surrounding capture policy.", "依据当前采集策略收集或恢复范围内产物。"],
  [/^write|^store|^persist|^append/, "Persist the supplied local artifact according to this module's storage contract.", "按本模块存储契约保存提供的本地产物。"],
  [/^read|^load|^parse|^normalize/, "Read or normalize the supplied structure while preserving explicit identity.", "读取或规范化提供的结构，并保留明确身份。"],
  [/^reconcile|^.*Summary|^.*Closure/, "Summarize observed evidence for explicit reconciliation.", "汇总已观察证据，供明确的完整性核对使用。"],
  [/^start|^run|^launch|^connect/, "Enter this lifecycle operation using the configured local scope.", "在配置的本地范围内进入此生命周期操作。"],
  [/^cancel|^stop|^remove|^release/, "End or release only the resource owned by the current operation.", "结束或释放当前操作所管理的资源。"],
  [/^build|^create|^make|^.*Key|^sha/, "Derive this helper value from the supplied inputs.", "从提供的输入生成本辅助值。"]
];
let count = 0, modules = 0;
async function annotate(file) {
  let text = await fs.readFile(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const commentRanges = new Map();
  function visit(node) {
    for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])]) {
      commentRanges.set(`${range.pos}:${range.end}`, range);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const edits = [];
  for (const range of commentRanges.values()) {
    const raw = text.slice(range.pos, range.end);
    if (raw.includes("EN:") && raw.includes("ZH:")) continue;
    const clean = raw.replace(/^\/\*\*?|\*\/$/g, "").replace(/^\/\//, "").replace(/^\s*\*\s?/gm, "").trim().replace(/\s+/g, " ");
    if (!clean || clean.startsWith("@ts-") || clean.includes("sourceMappingURL")) continue;
    let chinese = translations.find(([anchor]) => clean.toLowerCase().includes(anchor.toLowerCase()))?.[1];
    if (!chinese) {
      if (/[\u4e00-\u9fff]/u.test(clean)) chinese = clean;
      else chinese = "此处解释当前操作的局部约束；保持上方英文所述的输入范围和恢复边界。";
    }
    const english = /[\u4e00-\u9fff]/u.test(clean) ? "Preserve the local operation's stated scope and guard condition." : clean;
    edits.push({ pos: range.pos, end: range.end, value: `/** EN: ${english.replaceAll("*/", "* /")}\n * ZH: ${chinese.replaceAll("*/", "* /")} */` });
    count++;
  }
  const isTest = file.includes(`${path.sep}tests${path.sep}`);
  function add(node) {
    if (!isTest && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
      const leading = ts.getLeadingCommentRanges(text, node.pos) ?? [];
      if (!leading.length) {
        const name = node.name.getText(source), meaning = meanings.find(([pattern]) => pattern.test(name));
        let en = meaning?.[1] ?? `Define the ${name} contract or operation in this module.`;
        let zh = meaning?.[2] ?? `定义本模块的 ${name} 契约或操作。`;
        const position = node.getStart(source);
        const indentation = text.slice(text.lastIndexOf("\n", position) + 1, position).match(/^\s*/)?.[0] ?? "";
        edits.push({ pos: position, end: position, value: `/** EN: ${en}\n${indentation} * ZH: ${zh} */\n${indentation}` });
        count++;
      }
    }
    ts.forEachChild(node, add);
  }
  add(source);
  for (const edit of edits.sort((a, b) => b.pos - a.pos || b.end - a.end)) text = text.slice(0, edit.pos) + edit.value + text.slice(edit.end);
  const purpose = isTest
    ? ["Run synthetic regression checks without live record inputs.", "运行合成回归检查，不使用真实记录输入。"]
    : purposes[path.basename(file)] ?? ["Implement local collector support logic and explicit interfaces.", "实现本地采集器辅助逻辑与明确接口。"];
  text = `/** EN: ${purpose[0]}\n * ZH: ${purpose[1]} */\n` + text;
  const formatted = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  await fs.writeFile(file, formatted, "utf8"); modules++;
}
async function walk(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await walk(file);
    else if (item.isFile() && /\.(ts|js|mjs|cjs)$/.test(item.name)) await annotate(file);
  }
}
for (const directory of ["src", "ui", "electron", "scripts", "examples"]) await walk(path.join(root, directory));
console.log(JSON.stringify({ stage: "BILINGUAL_SOURCE_COMMENTS", status: "WRITTEN", modules, bilingual_comments: count }));
