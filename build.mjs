import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const QUICKJS_DIR = 'quickjs';
const ZIG_PATH = 'bin/zig/zig';
const VERSION = '2024-01-13';
const BIN_DIR = 'bin';
const DIST_DIR = 'dist';
const INPUT_FILE = 'src/eid-app.mjs';

if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });
if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });

/**
 * Stage 0: Identify the host qjsc binary
 */
const platform = os.platform();
const arch = os.arch();

let hostQjscName = '';
if (platform === 'darwin') {
    hostQjscName = (arch === 'arm64') ? 'qjsc_mac_arm' : 'qjsc_mac_intel';
} else if (platform === 'linux') {
    hostQjscName = (arch === 'arm64' || arch === 'aarch64') ? 'qjsc_linux_arm' : (arch === 'x64' ? 'qjsc_linux64' : 'qjsc_linux32');
} else if (platform === 'win32') {
    hostQjscName = (arch === 'x64') ? 'qjsc_win64.exe' : 'qjsc_win32.exe';
}

const hostQjsc = path.join(BIN_DIR, hostQjscName);

// Source files
const baseSourcesList = [
    'quickjs.c', 'libregexp.c', 'libunicode.c', 'cutils.c', 'quickjs-libc.c', 'dtoa.c'
];
const baseSources = baseSourcesList.map(f => path.join(QUICKJS_DIR, f)).join(' ');

const targets = [
  { id: 'x86_64-windows-gnu', qjs: 'qjs_win64.exe', qjsc: 'qjsc_win64.exe', app: 'eid-app_win64.exe', libs: '-lm' },
  { id: 'x86-windows-gnu',    qjs: 'qjs_win32.exe', qjsc: 'qjsc_win32.exe', app: 'eid-app_win32.exe', libs: '-lm' },
  { id: 'x86_64-linux-gnu',   qjs: 'qjs_linux64',   qjsc: 'qjsc_linux64',   app: 'eid-app_linux64',   libs: '-lm -lpthread -ldl' },
  { id: 'x86-linux-gnu',      qjs: 'qjs_linux32',   qjsc: 'qjsc_linux32',   app: 'eid-app_linux32',   libs: '-lm -lpthread -ldl' },
  { id: 'x86_64-macos',       qjs: 'qjs_mac_intel', qjsc: 'qjsc_mac_intel', app: 'eid-app_mac_intel', libs: '-lm -lpthread -ldl' },
  { id: 'aarch64-macos',      qjs: 'qjs_mac_arm',   qjsc: 'qjsc_mac_arm',   app: 'eid-app_mac_arm',   libs: '-lm -lpthread -ldl' }
];

// ==========================================================
// STAGE 1: BUILDING TOOLS (qjs and qjsc)
// ==========================================================
console.log("=== STAGE 1: Building Tools ===");

const stubPath = path.join(QUICKJS_DIR, 'repl_stub.c');
writeFileSync(stubPath, `#include <stdint.h>\nconst uint8_t qjsc_repl[] = { 0 };\nconst uint32_t qjsc_repl_size = 0;`);

targets.forEach(target => {
  console.log(`\n--- Tools for ${target.id} ---`);
  const commonFlags = `${ZIG_PATH} cc -target ${target.id} -I${QUICKJS_DIR} -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\\"${VERSION}\\" -Wno-ignored-attributes -Wno-unterminated-string-initialization -Wno-incompatible-pointer-types-discards-qualifiers ${target.libs} -s`;

  try {
    execSync(`${commonFlags} -o ${path.join(BIN_DIR, target.qjs)} ${baseSources} ${stubPath} ${path.join(QUICKJS_DIR, 'qjs.c')}`, { stdio: 'inherit' });
    execSync(`${commonFlags} -o ${path.join(BIN_DIR, target.qjsc)} ${baseSources} ${path.join(QUICKJS_DIR, 'qjsc.c')}`, { stdio: 'inherit' });
    console.log(`✅ Tools built.`);
  } catch(e) {
    console.error(`❌ Build failed for ${target.id}`);
  }
});

// ==========================================================
// STAGE 2: BUILDING EID-APP
// ==========================================================
console.log(`\n=== STAGE 2: Building App (Host: ${hostQjscName}) ===`);

if (!existsSync(hostQjsc)) {
    console.error(`❌ Error: Host tool ${hostQjscName} not found. Build stage 1 first.`);
    process.exit(1);
}

targets.forEach(target => {
    console.log(`\n--- App Build: ${target.id} ---`);
    const appOut = path.join(DIST_DIR, target.app);
    const tempCFile = path.join(BIN_DIR, `${target.id}_app.c`);

    try {
        console.log(`   > Exporting C source...`);
        execSync(`./${hostQjsc} -e -o ${tempCFile} ${INPUT_FILE}`, { stdio: 'inherit' });

        console.log(`   > Cross-compiling with Zig...`);
        const compileCmd = [
            ZIG_PATH, `cc -target ${target.id}`,
            `-o ${appOut}`,
            tempCFile,
            baseSources,
            `-I${QUICKJS_DIR}`,
            `-D_GNU_SOURCE`,
            `-DCONFIG_VERSION=\\"${VERSION}\\"`,
            `-Wno-incompatible-pointer-types-discards-qualifiers`,
            `-O2 -s`,
            target.libs
        ].join(' ');

        execSync(compileCmd, { stdio: 'inherit' });
        console.log(`✅ App created: ${appOut}`);
    } catch (err) {
        console.error(`❌ Application build failed for ${target.id}`);
    }
});

// ==========================================================
// STAGE 3: CLEANUP
// ==========================================================
console.log("\n=== STAGE 3: Cleanup ===");

if (existsSync(stubPath)) {
    unlinkSync(stubPath);
    console.log("🧹 Removed repl_stub.c");
}

// Remove all generated .c files in the bin directory
if (existsSync(BIN_DIR)) {
    const files = readdirSync(BIN_DIR);
    files.forEach(file => {
        if (file.endsWith('.c')) {
            const filePath = path.join(BIN_DIR, file);
            unlinkSync(filePath);
            console.log(`🧹 Removed temporary source: ${file}`);
        }
    });
}

console.log("\n--- Full build process completed ---");