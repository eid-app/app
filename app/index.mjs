import * as os from 'os';
import * as pkcs11 from 'pkcs11';
import { alert } from './dialogs/index.mjs';

/**
 * Returns the standard path for the Belgium eID middleware.
 * [DEBUG] uses os.platform property (no parentheses in QJS os module)
 */
function getBeidPath() {
    const p = os.platform;
    console.log("[DEBUG] Platform:", p);
    if (p === 'darwin') return "/Library/Belgium Identity Card/Pkcs11/libbeidpkcs11.dylib";
    if (p === 'win32') return "C:/Windows/System32/beidpkcs11.dll";
    return "/usr/lib/libbeidpkcs11.so";
}

try {
    const libPath = getBeidPath();
    console.log("[DEBUG] Loading library:", libPath);
    alert(`Loading library: ${libPath}`);

    const context = pkcs11.loadLibrary(libPath);
    if (context === null) {
        console.log("[ERROR] Library context is null. Check middleware installation.");
    } else {
        const initRv = pkcs11.C_Initialize(context);
        console.log("[DEBUG] C_Initialize RV:", initRv);

        if (initRv === 0) {
            const slots = pkcs11.C_GetSlotList(context);
            console.log("[DEBUG] Slots found:", slots.length);

            if (slots.length > 0) {
                const slotId = slots[0];
                console.log("[DEBUG] Using Slot ID:", slotId);

                // Fetch CKO_DATA objects
                console.log("[DEBUG] Calling listDataObjects...");
                const objects = pkcs11.listDataObjects(context, slotId);

                if (!objects || objects.length === 0) {
                    console.log("[WARN] No CKO_DATA objects found. Is the card inserted?");
                } else {
                    console.log("[INFO] Found " + objects.length + " objects:");

                    objects.forEach((o, i) => {
                        const label = (o.label || "unnamed").trim();
                        const vLen = o.value ? o.value.byteLength : 0;

                        console.log("  [" + i + "] Label: " + label + " | Handle: " + o.handle + " | Size: " + vLen);

                        if (vLen > 0) {
                            // Raw data preview: replace non-printable with '.'
                            const buf = new Uint8Array(o.value);
                            let preview = "";
                            for(let j = 0; j < Math.min(vLen, 50); j++) {
                                const charCode = buf[j];
                                preview += (charCode >= 32 && charCode <= 126)
                                    ? String.fromCharCode(charCode)
                                    : ".";
                            }
                            console.log("      Preview: " + preview + "...");
                        }
                    });
                }
            } else {
                console.log("[ERROR] No slot/reader detected.");
            }

            console.log("[DEBUG] Finalizing...");
            pkcs11.C_Finalize(context);
        } else {
            console.log("[ERROR] C_Initialize failed with code: " + initRv);
        }
    }
} catch (err) {
    console.log("[FATAL] Exception occurred:");
    console.log(err.message);
}