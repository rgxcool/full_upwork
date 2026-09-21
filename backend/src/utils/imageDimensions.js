import { Buffer } from "node:buffer";

export const MAX_IMAGE_DIMENSION = 10000;

function parsePng(buffer) {
    if (buffer.length < 24) return null;
    const signature = buffer.subarray(0, 8);
    if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return null;
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
}

function parseJpeg(buffer) {
    if (buffer.length < 4) return null;
    if (buffer.readUInt16BE(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        // Restart markers (D0-D7) have no length; standalone SOI.
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            offset += 2;
            continue;
        }
        const length = buffer.readUInt16BE(offset + 2);
        const segmentStart = offset + 2;
        const segmentEnd = segmentStart + length;
        // SOF0-SOF15 (except DHT C4, JPG C8, DAC CC) carry dimensions.
        const isStartOfFrame =
            (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isStartOfFrame && segmentEnd <= buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            if (!width || !height) return null;
            return { width, height };
        }
        if (length < 2) return null;
        offset = segmentEnd;
    }
    return null;
}

function parseWebp(buffer) {
    if (buffer.length < 30) return null;
    if (buffer.toString("latin1", 0, 4) !== "RIFF") return null;
    if (buffer.toString("latin1", 8, 12) !== "WEBP") return null;
    const chunkType = buffer.toString("latin1", 12, 16);

    if (chunkType === "VP8X") {
        // Extended format: three-byte little-endian width-1/height-1 at offset 24.
        const width = buffer.readUIntLE(24, 3) + 1;
        const height = buffer.readUIntLE(27, 3) + 1;
        if (!width || !height) return null;
        return { width, height };
    }

    if (chunkType === "VP8 ") {
        // Lossy: width/height stored as 14-bit little-endian at offset 26/28.
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        if (!width || !height) return null;
        return { width, height };
    }

    if (chunkType === "VP8L") {
        // Lossless: 14-bit width-1/height-1 bit-packed after the 0x2f signature.
        if (buffer[20] !== 0x2f) return null;
        const width = (buffer[21] | ((buffer[22] & 0x3f) << 8)) + 1;
        const height = (((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10))) + 1;
        if (!width || !height) return null;
        return { width, height };
    }

    return null;
}

/**
 * Read the pixel dimensions of a PNG / JPEG / WebP buffer without an image
 * library. Returns { width, height } or null when the buffer is not a
 * decodable image of one of those types.
 */
export function readImageDimensions(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    return parsePng(buffer) || parseJpeg(buffer) || parseWebp(buffer);
}

/**
 * Validate that the buffer is one of the supported image types and does not
 * exceed the allowed pixel dimension. Used for logo / signature uploads so a
 * corrupt or oversized image can never be stored and inlined into a PDF.
 */
export function validateImageBuffer(buffer, { maxDimension = MAX_IMAGE_DIMENSION } = {}) {
    const dims = readImageDimensions(buffer);
    if (!dims) return { ok: false, reason: "Ogiltig bild" };
    if (dims.width > maxDimension || dims.height > maxDimension) {
        return { ok: false, reason: "Bilden är för stor (max 10000 px per sida)." };
    }
    return { ok: true, dimensions: dims };
}