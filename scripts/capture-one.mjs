/** EN: Implement local collector support logic and explicit interfaces.
 * ZH: 实现本地采集器辅助逻辑与明确接口。 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
/** EN: Define the fail contract or operation in this module.
 * ZH: 定义本模块的 fail 契约或操作。 */
function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(2);
}
const values = new Map();
const flags = new Set();
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--record-id") {
        const value = args[index + 1];
        if (!value)
            fail("--record-id requires a value");
        values.set(arg, value);
        index += 1;
    }
    else if (["--no-auto-next", "--resume-existing", "--skip-build", "--no-profile-clone"].includes(arg)) {
        flags.add(arg);
    }
    else {
        fail(`unsupported argument: ${arg}`);
    }
}
const recordId = values.get("--record-id") ?? "";
if (!/^\d+$/.test(recordId)) {
    fail("usage: node capture-one.mjs --record-id DIGITS --no-auto-next [--resume-existing] [--skip-build]");
}
const powerShellArgs = [
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", path.join(here, "capture-one.ps1"),
    "-RecordId", recordId,
    "-NoAutoNext"
];
if (flags.has("--resume-existing"))
    powerShellArgs.push("-ResumeExisting");
if (flags.has("--skip-build"))
    powerShellArgs.push("-SkipBuild");
if (flags.has("--no-profile-clone"))
    powerShellArgs.push("-NoProfileClone");
const result = spawnSync("powershell.exe", powerShellArgs, { cwd: here, stdio: "inherit", windowsHide: false });
if (result.error)
    throw result.error;
process.exitCode = result.status ?? 1;
