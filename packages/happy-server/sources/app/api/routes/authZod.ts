import { z } from "zod";

/** Base64 key/signature material for NaCl (32–64 byte raw); cap before decode to limit memory DoS. */
export const b64KeyMaterial = z.string().min(1).max(512);

/** Encrypted / boxed responses stay small; cap to reject pathological payloads. */
export const b64ResponsePayload = z.string().min(1).max(8192);
