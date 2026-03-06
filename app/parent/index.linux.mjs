import * as os from 'os';
import * as std from 'std';

export function parent() {
    const pid = os.getpid();
    const parentId = execSync(['ps', '-p',  `${pid}`, '-o', 'ppid=']);
    const parentName = execSync(['ps', '-p', `${parentId}`, '-o',  'comm=']);
    const parentPath = execSync(['readlink', '-f', `/proc/${parentId}/exe`]);

    return { name: parentName, path: parentPath };
}

function execSync(cmd) {
    const tmpOut = std.tmpfile();
    os.exec(cmd, { stdout: tmpOut.fileno()} );
    tmpOut.seek(0);
    const result = tmpOut.readAsString();
    tmpOut.close();

    return result.replace("\r", '').replace("\n", '').trim();
}