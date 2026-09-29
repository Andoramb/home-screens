import { promises as fs } from 'fs';
import { imageSize } from 'image-size';
import { MAX_IMPORT_IMAGE_BYTES } from '@/lib/media-formats';

/**
 * First stage of dimension reading: sane files carry their headers in the
 * first few KiB, so probe only this much instead of buffering whole phone
 * JPEGs (a library of those would cost the Pi seconds of disk per page open).
 */
const HEADER_PROBE_BYTES = 64 * 1024;

function dimensionsOf(dims: {
  width: number | undefined;
  height: number | undefined;
  orientation?: number;
}): { width: number; height: number } | undefined {
  const { width, height, orientation } = dims;
  if (typeof width !== 'number' || !Number.isFinite(width)
    || typeof height !== 'number' || !Number.isFinite(height)) return undefined;
  // EXIF orientations 5 to 8 store the picture on its side and rely on the
  // viewer to turn it: what people see is the other way round.
  return typeof orientation === 'number' && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Two-stage dimension read. Stage one reads only the first 64 KiB, since
 * dimension headers live in the first few KiB of sane files and buffering
 * whole phone JPEGs would hammer the Pi's disk for seconds per page open.
 * A stage-one throw usually means truncation: the dimension info sits past
 * the probe (e.g. a fat EXIF segment pushing the JPEG's SOF marker out),
 * so stage two retries once against the whole file, capped at the largest
 * image the library ever accepts. A stage-two throw means the file is
 * genuinely corrupt, and the caller ships it without dimensions.
 */
export async function readImageDimensions(
  full: string,
  size: number,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const fh = await fs.open(full, 'r');
    try {
      const buf = Buffer.alloc(Math.min(HEADER_PROBE_BYTES, size));
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      return dimensionsOf(imageSize(buf.subarray(0, bytesRead)));
    } finally {
      await fh.close();
    }
  } catch {
    if (size > MAX_IMPORT_IMAGE_BYTES) return undefined;
    try {
      return dimensionsOf(imageSize(await fs.readFile(full)));
    } catch {
      return undefined;
    }
  }
}

