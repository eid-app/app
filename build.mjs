import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, cpSync, readFileSync, renameSync, copyFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const QUICKJS_DIR = 'quickjs';
const ZIG_PATH = 'bin/zig/zig';
const VERSION = '2024-01-13';
const BIN_DIR = 'bin';
const DIST_DIR = 'dist';
const SRC_MAC_TEMPLATE = 'src/mac/e-ID app.app';
const INPUT_FILE = 'src/eid-app.mjs';

const LIBC_PATH = path.join(QUICKJS_DIR, 'quickjs-libc.c');
const LIBC_BAK = path.join(QUICKJS_DIR, 'quickjs-libc.c.bak');

if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });
if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });

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

// ==========================================================
// STAGE 0: PATCH QUICKJS-LIBC (EXTERNAL FILE & TRICK)
// ==========================================================
console.log("=== STAGE 0: Injecting Win32 implementation and Registration Trick ===");

const EXEC_SRC_PATH = 'src/exec.c';

if (existsSync(LIBC_PATH) && existsSync(EXEC_SRC_PATH)) {
    if (!existsSync(LIBC_BAK)) cpSync(LIBC_PATH, LIBC_BAK);

    let content = readFileSync(LIBC_PATH, 'utf8');
    const win32Implementation = readFileSync(EXEC_SRC_PATH, 'utf8');

    // 1. Prepend process.h
    content = '#if defined(_WIN32)\n#include <process.h>\n#endif\n' + content;

    // 2. Registration Trick (Your exact method)
    // Wrap the entry to escape the #if !defined(_WIN32)
    const oldEntry = '    JS_CFUNC_DEF("exec", 1, js_os_exec ),';
    const newEntry = `#endif
    JS_CFUNC_DEF("exec", 1, js_os_exec ),
#if !defined(_WIN32)`;

    if (content.includes(oldEntry)) {
        content = content.replace(oldEntry, newEntry);
        console.log("   > Applied registration trick (#endif / #if).");
    }

    // 3. Inject function implementation before js_worker_class
    const targetBefore = 'static JSClassDef js_worker_class = {';
    if (content.includes(targetBefore)) {
        content = content.replace(targetBefore, win32Implementation + '\n' + targetBefore);
        console.log("   > Win32 js_os_exec injected before js_worker_class.");
    }

    writeFileSync(LIBC_PATH, content);
    console.log("✅ Stage 0 completed successfully.");
} else {
    console.error("❌ Critical: LIBC_PATH or src/exec.c missing.");
}

const baseSourcesList = ['quickjs.c', 'libregexp.c', 'libunicode.c', 'cutils.c', 'quickjs-libc.c', 'dtoa.c'];
const baseSources = baseSourcesList.map(f => path.join(QUICKJS_DIR, f)).join(' ');

const targets = [
  { id: 'x86_64-windows-gnu', qjs: 'qjs_win64.exe', qjsc: 'qjsc_win64.exe', app: 'eid-app_win64.exe', libs: '-lm' },
  { id: 'x86-windows-gnu',    qjs: 'qjs_win32.exe', qjsc: 'qjsc_win32.exe', app: 'eid-app_win32.exe', libs: '-lm' },
  { id: 'x86_64-linux-gnu',   qjs: 'qjs_linux64',   qjsc: 'qjsc_linux64',   app: 'eid-app_linux64',   libs: '-lm -lpthread -ldl' },
  { id: 'x86-linux-gnu',      qjs: 'qjs_linux32',   qjsc: 'qjsc_linux32',   app: 'eid-app_linux32',   libs: '-lm -lpthread -ldl' },
  { id: 'x86_64-macos',       qjs: 'qjs_mac_intel', qjsc: 'qjsc_mac_intel', app: 'eid-app_mac_intel', libs: '-lm -lpthread -ldl', isMac: true, bundleSuffix: 'mac_intel' },
  { id: 'aarch64-macos',      qjs: 'qjs_mac_arm',   qjsc: 'qjsc_mac_arm',   app: 'eid-app_mac_arm',   libs: '-lm -lpthread -ldl', isMac: true, bundleSuffix: 'mac_arm' }
];

// ==========================================================
// STAGE 1: BUILDING TOOLS
// ==========================================================
console.log("\n=== STAGE 1: Building Tools ===");
const stubPath = path.join(QUICKJS_DIR, 'repl_stub.c');
writeFileSync(stubPath, `#include <stdint.h>\nconst uint8_t qjsc_repl[] = { 0 };\nconst uint32_t qjsc_repl_size = 0;`);

targets.forEach(target => {
  console.log(`\n--- Tools for ${target.id} ---`);
  const commonFlags = `${ZIG_PATH} cc -target ${target.id} -I${QUICKJS_DIR} -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\\"${VERSION}\\" -Wno-ignored-attributes -Wno-unterminated-string-initialization -Wno-incompatible-pointer-types-discards-qualifiers ${target.libs} -s`;
  try {
    execSync(`${commonFlags} -o ${path.join(BIN_DIR, target.qjs)} ${baseSources} ${stubPath} ${path.join(QUICKJS_DIR, 'qjs.c')}`, { stdio: 'inherit' });
    execSync(`${commonFlags} -o ${path.join(BIN_DIR, target.qjsc)} ${baseSources} ${path.join(QUICKJS_DIR, 'qjsc.c')}`, { stdio: 'inherit' });
    console.log(`✅ qjs and qjsc built for ${target.id}`);
  } catch(e) {
    console.error(`❌ Build failed for ${target.id}`);
  }
});

// ==========================================================
// STAGE 2: BUILDING EID-APP BINARIES
// ==========================================================
console.log(`\n=== STAGE 2: Building App Binaries ===`);

targets.forEach(target => {
    console.log(`\n--- Binary Build: ${target.id} ---`);
    const appOut = path.join(DIST_DIR, target.app);
    const tempCFile = path.join(BIN_DIR, `${target.id}_app.c`);
    try {
        execSync(`./${hostQjsc} -e -o ${tempCFile} ${INPUT_FILE}`, { stdio: 'inherit' });
        const compileCmd = [
            ZIG_PATH, `cc -target ${target.id}`, `-o ${appOut}`, tempCFile, baseSources,
            `-I${QUICKJS_DIR}`, `-D_GNU_SOURCE`, `-DCONFIG_VERSION=\\"${VERSION}\\"`,
            `-Wno-incompatible-pointer-types-discards-qualifiers`, `-O2 -s`, target.libs
        ].join(' ');
        execSync(compileCmd, { stdio: 'inherit' });
        console.log(`✅ Binary created: ${appOut}`);
    } catch (err) {
        console.error(`❌ Binary build failed for ${target.id}`);
    }
});

// ==========================================================
// STAGE 3: PACKAGING MACOS BUNDLES
// ==========================================================
console.log(`\n=== STAGE 3: Packaging MacOS Bundles ===`);
targets.filter(t => t.isMac).forEach(target => {
    const bundlePath = path.join(DIST_DIR, `e-ID app_${target.bundleSuffix}.app`);
    const destBinary = path.join(bundlePath, 'Contents', 'MacOS', 'eid-app');
    try {
        cpSync(SRC_MAC_TEMPLATE, bundlePath, { recursive: true });
        mkdirSync(path.dirname(destBinary), { recursive: true });
        cpSync(path.join(DIST_DIR, target.app), destBinary);
        execSync(`chmod +x "${destBinary}"`);
        console.log(`✅ Bundle ready: ${bundlePath}`);
    } catch (err) {
        console.error(`❌ Packaging failed for ${target.id}`);
    }
});

// ==========================================================
// STAGE 4: CLEANUP & RESTORE
// ==========================================================
console.log("\n=== STAGE 4: Cleanup & Restore ===");

if (existsSync(LIBC_BAK)) {
    renameSync(LIBC_BAK, LIBC_PATH);
    console.log("🔄 quickjs-libc.c restored to original state.");
}

if (existsSync(stubPath)) unlinkSync(stubPath);
if (existsSync(BIN_DIR)) {
    readdirSync(BIN_DIR).forEach(file => {
        if (file.endsWith('.c')) {
            unlinkSync(path.join(BIN_DIR, file));
            console.log(`🧹 Removed: ${file}`);
        }
    });
}
console.log("\n--- Full process completed ---");