/** EN: Determine whether a persisted terminal capture may advance the record queue.
 * ZH: 判断已持久化的采集终态是否允许推进记录队列。 */
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
