/** EN: Define optional reviewer command policy separately from capture evidence and operator authorization.
 * ZH: 将可选 reviewer 命令策略与采集证据及操作者授权分开定义。 */
export type CodexWakeEventKind = "capture_terminal" | "queue_exhausted";
export type ReviewerDisposition = "keep" | "stop_obsolete" | "stop_timeout";
/** EN: Define the CurrentReviewEventState contract or operation in this module.
 * ZH: 定义本模块的 CurrentReviewEventState 契约或操作。 */
export interface CurrentReviewEventState {
    event_id: string;
    status: string;
}
/** EN: Capture reviews are deliberately single-turn. Disabling the goals feature for that resumed CLI invocation prevents the persistent goal runtime from immediately starting another model turn while the next capture is running. Queue exhaustion keeps goals enabled so the final reviewer can complete it.
 * ZH: 采集审查限定单轮；相关 CLI 调用关闭持续目标，避免下次采集运行时又发起模型轮次；队列结束时才允许最终收口。 */
export function codexResumeArgs(kind: CodexWakeEventKind, threadId: string): string[] {
    return [
        "exec",
        "resume",
        ...(kind === "capture_terminal" ? ["--disable", "goals"] : []),
        "--skip-git-repo-check",
        threadId,
        "-"
    ];
}
/** EN: Define the reviewerDisposition contract or operation in this module.
 * ZH: 定义本模块的 reviewerDisposition 契约或操作。 */
export function reviewerDisposition(activeEventId: string, activeSinceMs: number, current: CurrentReviewEventState | null, nowMs: number, timeoutMs: number): ReviewerDisposition {
    if (!current || current.event_id !== activeEventId || current.status !== "claimed")
        return "stop_obsolete";
    if (nowMs - activeSinceMs >= Math.max(30000, timeoutMs))
        return "stop_timeout";
    return "keep";
}
