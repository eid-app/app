import { script } from "../script/index.mjs";

export function alert(message) {
    return script(`display dialog ${JSON.stringify(message)} buttons "OK"`);
}

export function prompt(message) {
    return -1 === script(`display dialog ${JSON.stringify(message)} buttons {"Yes", "No"}`).indexOf(':Yes');
}
