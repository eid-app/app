import { script } from "../script/index.mjs";

export function alert(message) {
    return script(['--info', `--text=${JSON.stringify(message)}`]);
}

export function prompt(message) {
    return -1 !== script(['--question', `--text=${JSON.stringify(message)}`]).indexOf('0');
}
