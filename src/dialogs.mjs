import * as os from 'os';

import { alert as alertMac, prompt as promptMac } from './mac/dialogs.mjs';
import { alert as alertWin, prompt as promptWin } from './win/dialogs.mjs';

export function alert(message) {
    if ('darwin' === os.platform) {
        return alertMac(message);
    }
    if ('win32' === os.platform) {
        return alertWin(message);
    }
    console.log(message);
}

export function prompt(message) {
    if ('darwin' === os.platform) {
        return -1 !== promptMac(message).indexOf(':OK');
    }
    if ('win32' === os.platform) {
        return -1 !== promptWin(message).indexOf('1');
    }

    return true;
}