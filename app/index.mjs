import * as os from 'os';
import * as std from 'std';
import * as base64 from 'base64';
import * as pkcs11 from 'pkcs11';
import { alert, confirm } from './dialogs/index.mjs';
import { parent } from './parent/index.mjs';

let url = scriptArgs.length > 1 ? scriptArgs.pop() : '';

if (!url.startsWith('eid-app:')) {
    alert(`e-ID app is ready and installed in ${scriptArgs[0]}`);
    std.exit(0);
}

url = url.replaceAll('eid-app:', 'https:');

const caller = parent();
if (confirm(`${caller.name} ${caller.path} wants to read your e-ID card contents and send data to ${url}. Do you agree?`)) {
    eidRead();
}

/**
 * Returns the standard path for the Belgium eID middleware.
 */
function getBeidPath() {
    const p = os.platform;
    if (p === 'darwin') return "/Library/Belgium Identity Card/Pkcs11/libbeidpkcs11.dylib";
    if (p === 'win32') return "C:/Windows/System32/beidpkcs11.dll";
    return "/usr/lib/libbeidpkcs11.so";
}

function eidResult(data) {
    console.log(data);

    const cmd = [caller.path, `${url}${encodeURIComponent(JSON.stringify(data))}`];
    if ('darwin' === os.platform) {
        cmd.unshift('open');
    }

    return os.exec(cmd);
}

function eidError(msg) {
    console.log(msg);

    return eidResult({error: msg});
}

function eidRead() {
    try {
        const libPath = getBeidPath();
        const context = pkcs11.loadLibrary(libPath);
        if (context === null) {
            return eidError('Library context is null. Check middleware installation.');
        }

        const initRv = pkcs11.C_Initialize(context);
        if (0 !== initRv) {
            return eidError(`C_Initialize failed with code: ${initRv}`);
        }

        const slots = pkcs11.C_GetSlotList(context);
        if (0 === slots.length) {
            return eidError('No slot/reader detected.');
        }

        const slotId = slots[0];
        const objects = pkcs11.listDataObjects(context, slotId);

        if (!objects || objects.length === 0) {
            return eidError('No CKO_DATA objects found. Is the card inserted?');
        }

        const data = {};

        objects.forEach((o, i) => {
            let label = (o.label || `field${i}`).trim();
            if ('PHOTO_FILE' === label) {
                label = 'photo';
            }
            if (-1 !== label.indexOf('ATR') || -1 !== label.indexOf('DATA') || -1 !== label.indexOf('FILE')) {
                return;
            }
            data[label] = '';
            const vLen = o.value ? o.value.byteLength : 0;
            if (vLen > 0) {
                const buf = new Uint8Array(o.value);
                let value = '';
                const hex = [];
                for(var n = 0; n < buf.length; n++) {
                    hex[n] = buf[n].toString(16).padStart(2, '0');
                }
                try {
                    value = decodeURIComponent('%' + hex.join('%'));
                } catch {
                    value = String.fromCharCode.apply(null, buf);
                }
                if ('photo' === label) {
                    value = base64.encode(o.value);
                }
                if (-1 !== label.indexOf('carddata_') || -1 !== label.indexOf('_hash') || 'chip_number' === label) {
                    value = hex.join('');
                }
                data[label] = value;
            }
        });

        pkcs11.C_Finalize(context);

        return eidResult(data);
    } catch (err) {
        return eidError(`Exception occurred: ${err.message}`);
    }
}
