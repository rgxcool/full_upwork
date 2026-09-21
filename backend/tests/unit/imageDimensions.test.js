import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import {
    MAX_IMAGE_DIMENSION,
    readImageDimensions,
    validateImageBuffer,
} from "../../src/utils/imageDimensions.js";

const png16x16 = () => {
    // Minimal valid PNG header with IHDR width=16 height=16.
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    Buffer.from("IHDR", "latin1").copy(buf, 12);
    buf.writeUInt32BE(16, 16);
    buf.writeUInt32BE(16, 20);
    return buf;
};

const fakeJpeg = (width, height) => {
    // SOF0 marker with dimensions right after it.
    const buf = Buffer.alloc(15);
    buf.writeUInt16BE(0xffd8, 0); // SOI
    buf[2] = 0xff;
    buf[3] = 0xc0; // SOF0
    buf.writeUInt16BE(11, 4); // segment length (incl. length field)
    buf[6] = 8; // precision
    buf.writeUInt16BE(height, 7);
    buf.writeUInt16BE(width, 9);
    buf[11] = 1; // components
    buf[12] = 0x11; // component id
    buf[13] = 0x22; // sampling
    buf[14] = 0x00; // quantization table
    return buf;
};

describe("readImageDimensions", () => {
    it("reads PNG dimensions", () => {
        expect(readImageDimensions(png16x16())).toEqual({ width: 16, height: 16 });
    });

    it("reads JPEG dimensions from a SOF marker", () => {
        expect(readImageDimensions(fakeJpeg(800, 600))).toEqual({
            width: 800,
            height: 600,
        });
    });

    it("returns null for a non-image buffer", () => {
        expect(readImageDimensions(Buffer.from("hello world"))).toBe(null);
    });

    it("returns null for an empty buffer", () => {
        expect(readImageDimensions(Buffer.alloc(0))).toBe(null);
    });

    it("returns null for non-buffer input", () => {
        expect(readImageDimensions(null)).toBe(null);
        expect(readImageDimensions(undefined)).toBe(null);
    });
});

describe("validateImageBuffer", () => {
    it("accepts a small image within the dimension cap", () => {
        const result = validateImageBuffer(png16x16(), { maxDimension: 2048 });
        expect(result.ok).toBe(true);
        expect(result.dimensions).toEqual({ width: 16, height: 16 });
    });

    it("rejects an image exceeding the max dimension", () => {
        const result = validateImageBuffer(fakeJpeg(3000, 16), { maxDimension: 2048 });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain("för stor");
    });

    it("rejects a corrupt buffer as an invalid image", () => {
        const result = validateImageBuffer(Buffer.from("not-an-image"));
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("Ogiltig bild");
    });

    it("defaults to MAX_IMAGE_DIMENSION when no option passed", () => {
        expect(MAX_IMAGE_DIMENSION).toBe(10000);
        const result = validateImageBuffer(fakeJpeg(5000, 5000));
        expect(result.ok).toBe(true);
    });
});