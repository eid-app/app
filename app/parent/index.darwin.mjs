import * as os from 'os';
import { script } from "../script/index.mjs";

export function parent() {
    const pid = os.getpid();
    let ppid = parentId(pid);
    let parentPath = processName(ppid);
    if ('/sbin/launchd' === parentPath || '/bin/zsh' === parentPath) {
        ppid = parentId(ppid);
        parentPath = processName(ppid);
    }
    if ('' === parentPath) {
        parentPath = script(`POSIX path of (path to frontmost application)`).replace('\r', '').replace('\n', '');
    }
    const parts = parentPath.split('/');
    const app = parts.filter(p => p.endsWith('.app'));
    const parentName = (app.shift() || parts.pop()).replace('.app', '');

    return { name: parentName, path: parentPath };
}

function parentId(pid) {
    return script(`do shell script "ps -p ${pid} -o ppid= | xargs"`).replace('\r', '').replace('\n', '');
}

function processName(pid) {
    return script(`do shell script "ps -p ${pid} -o comm= | xargs"`).replace('\r', '').replace('\n', '');
}
