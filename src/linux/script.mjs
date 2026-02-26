import * as os from 'os';
import * as std from 'std';

export function script(source) {
    const tmpOut = std.tmpfile();
    os.exec(['zenity', ...source] , { stdout: tmpOut.fileno()} );
    tmpOut.seek(0);
    const result = tmpOut.readAsString();
    tmpOut.close();

    console.log(`Result = ${result}`);

    return result;
}