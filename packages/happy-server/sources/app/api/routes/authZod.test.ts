import { describe, it, expect } from "vitest";
import { z } from "zod";
import { b64KeyMaterial, b64ResponsePayload } from "./authZod";

describe("authZod limits", () => {
    it("accepts typical-length base64 key material", () => {
        const key = "a".repeat(44);
        expect(b64KeyMaterial.parse(key)).toBe(key);
    });

    it("rejects publicKey longer than 512 chars", () => {
        const huge = "x".repeat(513);
        expect(() => z.object({ publicKey: b64KeyMaterial }).parse({ publicKey: huge })).toThrow();
    });

    it("rejects empty publicKey", () => {
        expect(() => b64KeyMaterial.parse("")).toThrow();
    });

    it("rejects response payload over 8192 chars", () => {
        const huge = "r".repeat(8193);
        expect(() => b64ResponsePayload.parse(huge)).toThrow();
    });
});
