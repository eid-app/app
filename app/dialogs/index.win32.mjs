import { script } from "../script/index.mjs";

export function alert(message) {
    return script(`WScript.Echo MsgBox(${JSON.stringify(message)})`);
}

export function prompt(message) {
    return -1 !== script(`WScript.Echo MsgBox(${JSON.stringify(message)}, vbYesNo)`).indexOf('6');
}
