import { script } from "./script.mjs";

export function alert(message) {
    return script(`WScript.Echo MsgBox(${JSON.stringify(message)})`);
}

export function prompt(message) {
    return script(`WScript.Echo MsgBox(${JSON.stringify(message)}, vbYesNo)`);
}
