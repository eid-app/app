#include "quickjs-libc.h"
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>

static JSValue js_parent_info(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    DWORD ppid = 0;
    DWORD current_pid = GetCurrentProcessId();
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);

    if (Process32First(hSnapshot, &pe32)) {
        do {
            if (pe32.th32ProcessID == current_pid) {
                ppid = pe32.th32ParentProcessID;
                break;
            }
        } while (Process32Next(hSnapshot, &pe32));
    }
    CloseHandle(hSnapshot);

    if (ppid == 0) return JS_NULL;

    char path[MAX_PATH] = "";
    char name[MAX_PATH] = "";
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, ppid);
    if (hProcess) {
        DWORD size = sizeof(path);
        if (QueryFullProcessImageNameA(hProcess, 0, path, &size)) {
            char *lastSlash = strrchr(path, '\\');
            if (lastSlash) strcpy(name, lastSlash + 1);
            else strcpy(name, path);
        }
        CloseHandle(hProcess);
    }

    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "id", JS_NewInt32(ctx, ppid));
    JS_SetPropertyStr(ctx, obj, "name", JS_NewString(ctx, name));
    JS_SetPropertyStr(ctx, obj, "path", JS_NewString(ctx, path));
    return obj;
}
#else
static JSValue js_parent_info(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    return JS_NULL;
}
#endif

static const JSCFunctionListEntry js_parent_funcs[] = {
    JS_CFUNC_DEF("parent", 0, js_parent_info),
};

static int js_parent_init(JSContext *ctx, JSModuleDef *m) {
    return JS_SetModuleExportList(ctx, m, js_parent_funcs, sizeof(js_parent_funcs) / sizeof(js_parent_funcs[0]));
}

JSModuleDef *js_init_module_parent(JSContext *ctx, const char *module_name) {
    JSModuleDef *m;
    m = JS_NewCModule(ctx, module_name, js_parent_init);
    if (!m) return NULL;
    JS_AddModuleExportList(ctx, m, js_parent_funcs, sizeof(js_parent_funcs) / sizeof(js_parent_funcs[0]));
    return m;
}