#include "quickjs-libc.h"
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

static const char base64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *base64_encode(const uint8_t *data, size_t input_length, size_t *output_length) {
    *output_length = 4 * ((input_length + 2) / 3);
    char *encoded_data = malloc(*output_length + 1);
    if (encoded_data == NULL) return NULL;

    for (size_t i = 0, j = 0; i < input_length;) {
        uint32_t octet_a = i < input_length ? data[i++] : 0;
        uint32_t octet_b = i < input_length ? data[i++] : 0;
        uint32_t octet_c = i < input_length ? data[i++] : 0;

        uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

        encoded_data[j++] = base64_table[(triple >> 18) & 0x3F];
        encoded_data[j++] = base64_table[(triple >> 12) & 0x3F];
        encoded_data[j++] = base64_table[(triple >> 6) & 0x3F];
        encoded_data[j++] = base64_table[triple & 0x3F];
    }

    static const int mod_table[] = {0, 2, 1};
    for (int i = 0; i < mod_table[input_length % 3]; i++) {
        encoded_data[*output_length - 1 - i] = '=';
    }

    encoded_data[*output_length] = '\0';
    return encoded_data;
}

static JSValue js_base64_encode(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    size_t len;
    uint8_t *buf;
    JSValue ret;

    buf = JS_GetArrayBuffer(ctx, &len, argv[0]);
    if (!buf) {
        const char *str = JS_ToCStringLen(ctx, &len, argv[0]);
        if (!str) return JS_EXCEPTION;

        size_t out_len;
        char *res = base64_encode((const uint8_t *)str, len, &out_len);
        JS_FreeCString(ctx, str);

        if (!res) return JS_EXCEPTION;
        ret = JS_NewStringLen(ctx, res, out_len);
        free(res);
    } else {
        size_t out_len;
        char *res = base64_encode(buf, len, &out_len);
        if (!res) return JS_EXCEPTION;
        ret = JS_NewStringLen(ctx, res, out_len);
        free(res);
    }

    return ret;
}

static const JSCFunctionListEntry js_base64_funcs[] = {
    JS_CFUNC_DEF("encode", 1, js_base64_encode),
};

static int js_base64_init(JSContext *ctx, JSModuleDef *m) {
    return JS_SetModuleExportList(ctx, m, js_base64_funcs, (int)(sizeof(js_base64_funcs) / sizeof(js_base64_funcs[0])));
}

JSModuleDef *js_init_module_base64(JSContext *ctx, const char *module_name) {
    JSModuleDef *m;
    m = JS_NewCModule(ctx, module_name, js_base64_init);
    if (!m) return NULL;
    JS_AddModuleExportList(ctx, m, js_base64_funcs, (int)(sizeof(js_base64_funcs) / sizeof(js_base64_funcs[0])));
    return m;
}
