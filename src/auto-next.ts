/** EN: Advance only according to a persisted terminal capture outcome and configured queue policy.
 * ZH: 仅依据已持久化终态采集结果及已配置队列策略推进。 */
import type { JobStatus } from "./types.js";
export const AUTO_NEXT_DELAY_MS = 15000;
export type AutoNextDecision = "advance" | "stop_cancelled" | "ignore";
/** EN: Every non-cancelled terminal outcome advances after it has been durably recorded. Deferred warnings/errors are repaired after the main queue ends.
 * ZH: 非取消终态须先可靠保存，再推进队列；延后的警告和错误在主队列结束后修复。 */
export function autoNextDecision(job: JobStatus): AutoNextDecision {
    if (job.running)
        return "ignore";
    if (job.phase === "cancelled")
        return "stop_cancelled";
    if (job.phase === "complete" || job.phase === "incomplete" || job.phase === "failed" || job.errors.length > 0)
        return "advance";
    return "ignore";
}
