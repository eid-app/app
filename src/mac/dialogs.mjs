import { script } from "./script.mjs";

export function alert(message) {
    return script(`display dialog ${JSON.stringify(message)} buttons "OK"`);
}

export function prompt(message) {
    return script(`display dialog ${JSON.stringify(message)}`);
}
