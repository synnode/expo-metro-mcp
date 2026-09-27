import * as zlib from "zlib";

// Minimal, dependency-free PNG downscaler.
//
// Android `screencap -p` emits a standard, non-interlaced, 8-bit PNG (colour
// type 2 = RGB or 6 = RGBA). We decode that into raw pixels, box-average it down
// by a fractional factor, and re-encode. This lets us return the screenshot in a
// density-independent (dp) space so the image the model sees matches the tap
// coordinate space — mirroring what `sips -z` does for iOS — without pulling in a
// native image dependency such as sharp.
//
// Anything we do not recognise (other bit depths, palette/greyscale, interlaced)
// makes `downscalePng` return null so the caller can fall back to the original.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface DecodedPng {
  width: number;
  height: number;
  channels: number; // 3 (RGB) or 4 (RGBA)
  colorType: number; // 2 or 6
  pixels: Buffer; // width * height * channels, unfiltered
}

const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer: Buffer): DecodedPng | null {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  if (!width || !height) return null;
  if (bitDepth !== 8 || interlace !== 0) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels || !idatChunks.length) return null;

  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const stride = width * channels;
  const expected = height * (stride + 1); // +1 filter byte per scanline
  if (inflated.length < expected) return null;

  const pixels = Buffer.allocUnsafe(height * stride);
  let inPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[inPos++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let i = 0; i < stride; i++) {
      const raw = inflated[inPos++];
      const a = i >= channels ? pixels[rowStart + i - channels] : 0;
      const b = y > 0 ? pixels[prevStart + i] : 0;
      const c = y > 0 && i >= channels ? pixels[prevStart + i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + a; break;
        case 2: value = raw + b; break;
        case 3: value = raw + ((a + b) >> 1); break;
        case 4: value = raw + paeth(a, b, c); break;
        default: return null;
      }
      pixels[rowStart + i] = value & 0xff;
    }
  }

  return { width, height, channels, colorType, pixels };
}

function boxDownscale(src: DecodedPng, dstWidth: number, dstHeight: number): Buffer {
  const { width: srcW, height: srcH, channels, pixels } = src;
  const out = Buffer.allocUnsafe(dstWidth * dstHeight * channels);

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy0 = Math.floor((dy * srcH) / dstHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * srcH) / dstHeight));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx0 = Math.floor((dx * srcW) / dstWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * srcW) / dstWidth));
      const count = (sy1 - sy0) * (sx1 - sx0);

      for (let ch = 0; ch < channels; ch++) {
        let sum = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          const rowStart = sy * srcW * channels;
          for (let sx = sx0; sx < sx1; sx++) {
            sum += pixels[rowStart + sx * channels + ch];
          }
        }
        out[(dy * dstWidth + dx) * channels + ch] = Math.round(sum / count);
      }
    }
  }

  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, channels: number, colorType: number, pixels: Buffer): Buffer {
  const stride = width * channels;
  // Prefix each scanline with filter byte 0 (None); zlib does the rest.
  const raw = Buffer.allocUnsafe(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Downscale a PNG by `scale` (e.g. 3.0 for a 3x-density Android device).
 * Returns a new PNG buffer, or null if the input is not a format we can decode
 * or `scale` is not > 1 — in which case the caller should keep the original.
 */
export function downscalePng(buffer: Buffer, scale: number): Buffer | null {
  if (!(scale > 1)) return null;
  const decoded = decodePng(buffer);
  if (!decoded) return null;

  const dstWidth = Math.max(1, Math.round(decoded.width / scale));
  const dstHeight = Math.max(1, Math.round(decoded.height / scale));
  if (dstWidth >= decoded.width || dstHeight >= decoded.height) return null;

  const resized = boxDownscale(decoded, dstWidth, dstHeight);
  return encodePng(dstWidth, dstHeight, decoded.channels, decoded.colorType, resized);
}
