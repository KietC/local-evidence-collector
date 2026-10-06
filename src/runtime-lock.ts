/** EN: Coordinate local PID/directory locks; PID reuse, stale cleanup and crash windows remain limitations, not fenced ownership proof.
 * ZH: 协调本机 PID/目录锁；PID 复用、失效清理和崩溃窗口仍是局限，不构成 fencing 所有权证明。 */
import fs from "node:fs/promises";
import path from "node:path";
/** EN: Define the DirectoryLockOwner contract or operation in this module.
 * ZH: 定义本模块的 DirectoryLockOwner 契约或操作。 */
interface DirectoryLockOwner {
    schema: 1;
    pid: number;
    acquired_at: string;
}
const OWNER_FILE = "owner.json";
/** EN: Define the pidIsAlive contract or operation in this module.
 * ZH: 定义本模块的 pidIsAlive 契约或操作。 */
export function pidIsAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
/** EN: End or release only the resource owned by the current operation.
 * ZH: 结束或释放当前操作所管理的资源。 */
export async function removeStalePidFileLock(lockFile: string): Promise<boolean> {
    let pid = 0;
    try {
        pid = Number((await fs.readFile(lockFile, "utf8")).trim());
    }
    catch {
        return false;
    }
    if (pidIsAlive(pid))
        return false;
    await fs.rm(lockFile, { force: true });
    return true;
}
/** EN: Read or normalize the supplied structure while preserving explicit identity.
 * ZH: 读取或规范化提供的结构，并保留明确身份。 */
async function readDirectoryOwner(lockDirectory: string): Promise<DirectoryLockOwner | null> {
    try {
        const value = JSON.parse(await fs.readFile(path.join(lockDirectory, OWNER_FILE), "utf8")) as DirectoryLockOwner;
        if (value.schema === 1 && Number.isInteger(value.pid) && value.pid > 0)
            return value;
    }
    catch { /* legacy directory locks do not have owner metadata */ }
    return null;
}
/** EN: End or release only the resource owned by the current operation.
 * ZH: 结束或释放当前操作所管理的资源。 */
export async function removeStaleDirectoryLock(lockDirectory: string, staleAfterMs = 5 * 60000, nowMs = Date.now()): Promise<boolean> {
    let stat;
    try {
        stat = await fs.stat(lockDirectory);
    }
    catch {
        return false;
    }
    if (!stat.isDirectory())
        return false;
    const owner = await readDirectoryOwner(lockDirectory);
    if (owner && pidIsAlive(owner.pid))
        return false;
    if (!owner && nowMs - stat.mtimeMs <= staleAfterMs)
        return false;
    await fs.rm(lockDirectory, { recursive: true, force: true });
    return true;
}
/** EN: Define the withDirectoryLock contract or operation in this module.
 * ZH: 定义本模块的 withDirectoryLock 契约或操作。 */
export async function withDirectoryLock<T>(lockDirectory: string, action: () => Promise<T>, options: {
    timeoutMs?: number;
    staleAfterMs?: number;
    retryMs?: number;
} = {}): Promise<T> {
    const timeoutMs = Math.max(1000, options.timeoutMs ?? 120000);
    const staleAfterMs = Math.max(1000, options.staleAfterMs ?? 5 * 60000);
    const retryMs = Math.max(10, options.retryMs ?? 100);
    const deadline = Date.now() + timeoutMs;
    await fs.mkdir(path.dirname(lockDirectory), { recursive: true });
    for (;;) {
        try {
            await fs.mkdir(lockDirectory);
            await fs.writeFile(path.join(lockDirectory, OWNER_FILE), JSON.stringify({
                schema: 1,
                pid: process.pid,
                acquired_at: new Date().toISOString()
            } satisfies DirectoryLockOwner), "utf8");
            break;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                throw error;
            if (await removeStaleDirectoryLock(lockDirectory, staleAfterMs))
                continue;
            if (Date.now() >= deadline)
                throw new Error(`${path.basename(lockDirectory)} lock timeout`);
            await new Promise(resolve => setTimeout(resolve, retryMs));
        }
    }
    try {
        return await action();
    }
    finally {
        await fs.rm(lockDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
}
