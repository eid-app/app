import * as os from 'os';
import * as std from 'std';

import { alert, prompt } from "./dialogs.mjs";

console.log(os.platform);

alert('Hello world!');

if (!prompt('Continue ?')) {
    std.exit(0);
}

console.log('Continue...');