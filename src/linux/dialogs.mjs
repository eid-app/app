import { script } from "./script.mjs";

export function alert(message) {
    return script(['--info', `--text=${JSON.stringify(message)}`]);
}

export function prompt(message) {
    return script(['--question', `--text=${JSON.stringify(message)}`]);
}
