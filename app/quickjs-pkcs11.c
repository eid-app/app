#include "quickjs-libc.h"
#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
#define LIB_HANDLE HMODULE
#define LIB_LOAD(name) LoadLibraryA(name)
#define LIB_GET_PROC(h, name) GetProcAddress(h, name)
#define LIB_CLOSE(h) FreeLibrary(h)
#else
#include <dlfcn.h>
#define LIB_HANDLE void *
#define LIB_LOAD(name) dlopen(name, RTLD_NOW)
#define LIB_GET_PROC(h, name) dlsym(h, name)
#define LIB_CLOSE(h) dlclose(h)
#endif

#ifndef countof
#define countof(x) (sizeof(x) / sizeof((x)[0]))
#endif

/* --- PKCS11 TYPES --- */
typedef unsigned long CK_ULONG;
typedef unsigned long CK_RV;
typedef unsigned long CK_SLOT_ID;
typedef unsigned long CK_SESSION_HANDLE;
typedef unsigned long CK_OBJECT_HANDLE;
typedef unsigned long CK_ATTRIBUTE_TYPE;
typedef CK_ULONG CK_FLAGS;
typedef void * CK_VOID_PTR;

#define CKR_OK 0x00000000
#define CKF_SERIAL_SESSION 0x00000004
#define CKA_CLASS 0x00000000
#define CKA_LABEL 0x00000003
#define CKA_VALUE 0x00000011
#define CKO_DATA  0x00000000

typedef struct CK_VERSION {
    unsigned char major;
    unsigned char minor;
} CK_VERSION;

typedef struct CK_INFO {
    CK_VERSION cryptokiVersion;
    unsigned char manufacturerID[32];
    CK_FLAGS flags;
    unsigned char libraryDescription[32];
    CK_VERSION libraryVersion;
} CK_INFO;

typedef struct CK_SLOT_INFO {
    unsigned char slotDescription[64];
    unsigned char manufacturerID[32];
    CK_FLAGS flags;
    CK_VERSION hardwareVersion;
    CK_VERSION firmwareVersion;
} CK_SLOT_INFO;

typedef struct CK_ATTRIBUTE {
    CK_ATTRIBUTE_TYPE type;
    void * pValue;
    CK_ULONG ulValueLen;
} CK_ATTRIBUTE;

/* FULL PKCS11 FUNCTION LIST (v2.x) - 64 pointers to ensure correct offsets */
typedef struct CK_FUNCTION_LIST {
    CK_VERSION version;
    CK_RV (*C_Initialize)(CK_VOID_PTR);
    CK_RV (*C_Finalize)(CK_VOID_PTR);
    CK_RV (*C_GetInfo)(CK_INFO *);
    CK_RV (*C_GetFunctionList)(void **);
    CK_RV (*C_GetSlotList)(unsigned char, CK_SLOT_ID *, CK_ULONG *);
    CK_RV (*C_GetSlotInfo)(CK_SLOT_ID, CK_SLOT_INFO *);
    CK_RV (*C_GetTokenInfo)(CK_SLOT_ID, void *);
    CK_RV (*C_GetMechanismList)(CK_SLOT_ID, void *, CK_ULONG *);
    CK_RV (*C_GetMechanismInfo)(CK_SLOT_ID, CK_ULONG, void *);
    CK_RV (*C_InitToken)(CK_SLOT_ID, void *, CK_ULONG, void *);
    CK_RV (*C_InitPIN)(CK_SESSION_HANDLE, void *, CK_ULONG);
    CK_RV (*C_SetPIN)(CK_SESSION_HANDLE, void *, CK_ULONG, void *, CK_ULONG);
    CK_RV (*C_OpenSession)(CK_SLOT_ID, CK_FLAGS, CK_VOID_PTR, void *, CK_SESSION_HANDLE *);
    CK_RV (*C_CloseSession)(CK_SESSION_HANDLE);
    CK_RV (*C_CloseAllSessions)(CK_SLOT_ID);
    CK_RV (*C_GetSessionInfo)(CK_SESSION_HANDLE, void *);
    CK_RV (*C_GetOperationState)(CK_SESSION_HANDLE, void *, CK_ULONG *);
    CK_RV (*C_SetOperationState)(CK_SESSION_HANDLE, void *, CK_ULONG, CK_OBJECT_HANDLE, CK_OBJECT_HANDLE);
    CK_RV (*C_Login)(CK_SESSION_HANDLE, CK_ULONG, void *, CK_ULONG);
    CK_RV (*C_Logout)(CK_SESSION_HANDLE);
    CK_RV (*C_CreateObject)(CK_SESSION_HANDLE, void *, CK_ULONG, CK_OBJECT_HANDLE *);
    CK_RV (*C_CopyObject)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE, void *, CK_ULONG, CK_OBJECT_HANDLE *);
    CK_RV (*C_DestroyObject)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE);
    CK_RV (*C_GetObjectSize)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE, CK_ULONG *);
    CK_RV (*C_GetAttributeValue)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE, CK_ATTRIBUTE *, CK_ULONG);
    CK_RV (*C_SetAttributeValue)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE, void *, CK_ULONG);
    CK_RV (*C_FindObjectsInit)(CK_SESSION_HANDLE, CK_ATTRIBUTE *, CK_ULONG);
    CK_RV (*C_FindObjects)(CK_SESSION_HANDLE, CK_OBJECT_HANDLE *, CK_ULONG, CK_ULONG *);
    CK_RV (*C_FindObjectsFinal)(CK_SESSION_HANDLE);
    CK_RV (*reserved[34]);
} CK_FUNCTION_LIST;

typedef CK_FUNCTION_LIST * CK_FUNCTION_LIST_PTR;
typedef CK_FUNCTION_LIST_PTR * CK_FUNCTION_LIST_PTR_PTR;

typedef struct {
    LIB_HANDLE handle;
    CK_FUNCTION_LIST_PTR funcs;
} PKCS11Context;

static JSClassID js_pkcs11_class_id;

static void js_pkcs11_finalizer(JSRuntime *rt, JSValue val) {
    PKCS11Context *s = JS_GetOpaque(val, js_pkcs11_class_id);
    if (s) {
        if (s->handle) LIB_CLOSE(s->handle);
        js_free_rt(rt, s);
    }
}

static JSClassDef js_pkcs11_class = { "PKCS11Context", .finalizer = js_pkcs11_finalizer };

static JSValue js_pkcs11_loadLibrary(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;
    LIB_HANDLE h = LIB_LOAD(path);
    JS_FreeCString(ctx, path);
    if (!h) return JS_ThrowTypeError(ctx, "Library not found");
    CK_RV (*get_funcs)(CK_FUNCTION_LIST_PTR_PTR) = (void *)LIB_GET_PROC(h, "C_GetFunctionList");
    if (!get_funcs) { LIB_CLOSE(h); return JS_ThrowTypeError(ctx, "Invalid PKCS11"); }
    PKCS11Context *s = js_mallocz(ctx, sizeof(*s));
    s->handle = h;
    get_funcs(&s->funcs);
    JSValue obj = JS_NewObjectClass(ctx, js_pkcs11_class_id);
    JS_SetOpaque(obj, s);
    return obj;
}

static JSValue js_pkcs11_initialize(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    PKCS11Context *s = JS_GetOpaque(argv[0], js_pkcs11_class_id);
    return JS_NewInt32(ctx, (int32_t)s->funcs->C_Initialize(NULL));
}

static JSValue js_pkcs11_finalize(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    PKCS11Context *s = JS_GetOpaque(argv[0], js_pkcs11_class_id);
    return JS_NewInt32(ctx, (int32_t)s->funcs->C_Finalize(NULL));
}

static JSValue js_pkcs11_getSlotList(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    PKCS11Context *s = JS_GetOpaque(argv[0], js_pkcs11_class_id);
    CK_ULONG count = 0;
    s->funcs->C_GetSlotList(1, NULL, &count);
    if (count == 0) return JS_NewArray(ctx);
    CK_SLOT_ID * slots = js_malloc(ctx, count * sizeof(CK_SLOT_ID));
    s->funcs->C_GetSlotList(1, slots, &count);
    JSValue array = JS_NewArray(ctx);
    for (uint32_t i = 0; i < (uint32_t)count; i++)
        JS_SetPropertyUint32(ctx, array, i, JS_NewInt64(ctx, (int64_t)slots[i]));
    js_free(ctx, slots);
    return array;
}

static JSValue js_pkcs11_listDataObjects(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    PKCS11Context *s = JS_GetOpaque(argv[0], js_pkcs11_class_id);
    int64_t slot_id;
    CK_SESSION_HANDLE hSession;
    CK_OBJECT_HANDLE hObject;
    CK_ULONG ulCount;
    JS_ToInt64(ctx, &slot_id, argv[1]);

    if (s->funcs->C_OpenSession((CK_SLOT_ID)slot_id, CKF_SERIAL_SESSION, NULL, NULL, &hSession) != CKR_OK)
        return JS_NewArray(ctx);

    CK_ULONG class_data = CKO_DATA;
    CK_ATTRIBUTE template[] = { { CKA_CLASS, &class_data, sizeof(class_data) } };

    JSValue array = JS_NewArray(ctx);
    uint32_t i = 0;

    if (s->funcs->C_FindObjectsInit(hSession, template, 1) == CKR_OK) {
        while (s->funcs->C_FindObjects(hSession, &hObject, 1, &ulCount) == CKR_OK && ulCount > 0) {
            char label[65];
            CK_ATTRIBUTE attr = { CKA_LABEL, label, sizeof(label) - 1 };
            if (s->funcs->C_GetAttributeValue(hSession, hObject, &attr, 1) == CKR_OK) {
                JSValue obj = JS_NewObject(ctx);
                JS_SetPropertyStr(ctx, obj, "handle", JS_NewInt64(ctx, (int64_t)hObject));
                JS_SetPropertyStr(ctx, obj, "label", JS_NewStringLen(ctx, label, attr.ulValueLen));

                // Fetch Value
                CK_ATTRIBUTE val_attr = { CKA_VALUE, NULL, 0 };
                if (s->funcs->C_GetAttributeValue(hSession, hObject, &val_attr, 1) == CKR_OK) {
                    uint8_t *buf = js_malloc(ctx, val_attr.ulValueLen);
                    val_attr.pValue = buf;
                    if (s->funcs->C_GetAttributeValue(hSession, hObject, &val_attr, 1) == CKR_OK) {
                        JS_SetPropertyStr(ctx, obj, "value", JS_NewArrayBufferCopy(ctx, buf, val_attr.ulValueLen));
                    }
                    js_free(ctx, buf);
                }
                JS_SetPropertyUint32(ctx, array, i++, obj);
            }
        }
        s->funcs->C_FindObjectsFinal(hSession);
    }
    s->funcs->C_CloseSession(hSession);
    return array;
}

static const JSCFunctionListEntry js_pkcs11_funcs[] = {
    JS_CFUNC_DEF("loadLibrary", 1, js_pkcs11_loadLibrary),
    JS_CFUNC_DEF("C_Initialize", 1, js_pkcs11_initialize),
    JS_CFUNC_DEF("C_Finalize", 1, js_pkcs11_finalize),
    JS_CFUNC_DEF("C_GetSlotList", 1, js_pkcs11_getSlotList),
    JS_CFUNC_DEF("listDataObjects", 2, js_pkcs11_listDataObjects),
};

static int js_pkcs11_init(JSContext *ctx, JSModuleDef *m) {
    JS_NewClassID(&js_pkcs11_class_id);
    JS_NewClass(JS_GetRuntime(ctx), js_pkcs11_class_id, &js_pkcs11_class);
    return JS_SetModuleExportList(ctx, m, js_pkcs11_funcs, countof(js_pkcs11_funcs));
}

JSModuleDef *js_init_module_pkcs11(JSContext *ctx, const char *name) {
    JSModuleDef *m = JS_NewCModule(ctx, name, js_pkcs11_init);
    JS_AddModuleExportList(ctx, m, js_pkcs11_funcs, countof(js_pkcs11_funcs));
    return m;
}