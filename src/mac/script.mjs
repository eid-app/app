import * as os from 'os';
import * as std from 'std';

export function script(source) {
    const tmpIn = std.tmpfile();
    tmpIn.puts(source);
    tmpIn.seek(0);
    const tmpOut = std.tmpfile();
    os.exec(['osascript'], { stdin: tmpIn.fileno(), stdout: tmpOut.fileno() });
    tmpOut.seek(0);
    const result = tmpOut.readAsString();
    tmpOut.close();
    tmpIn.close();

    return result;
}