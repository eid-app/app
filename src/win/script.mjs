import * as os from 'os';
import * as std from 'std';

export function script(source) {
    const tmpIn = std.open(std.getenv('TEMP') + '/script.vbs', 'w+');
    tmpIn.puts(source);
    tmpIn.close();
    const tmpOut = std.tmpfile();
    os.exec(['cscript', '/nologo', std.getenv('TEMP') + '/script.vbs'], { stdout: tmpOut.fileno() });
    tmpOut.seek(0);
    const result = tmpOut.readAsString();
    tmpOut.close();
    os.remove(std.getenv('TEMP') + '/script.vbs');

    return result;
}