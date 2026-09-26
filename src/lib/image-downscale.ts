/**
 * Make a photo smaller on the device before it is sent to the hub.
 *
 * Phone cameras write 12 to 48 megapixel JPEGs of 4 to 15 MB: slow over
 * Wi-Fi, often over the hub's 10 MB limit for a picture, and far bigger than
 * any wall shows (the wall asks for copies at its own size). A copy with the
 * long edge at 3840 px (a 4K wall) is plenty. Re-encoding also drops the
 * camera's EXIF block, GPS location included; `createImageBitmap` applies the
 * EXIF rotation first, so the copy stands the right way up.
 *
 * Anything this cannot improve goes as it is: GIFs (they may animate), SVGs
 * (they scale themselves), photos already small in both pixels and bytes, a
 * format this browser cannot decode, and the rare copy that comes out bigger.
 */

/** Longest side a photo is sent at: enough for a 4K wall. */
export const UPLOAD_MAX_EDGE = 3840;

/** A photo within the edge and this small in bytes goes as it is. */
export const UPLOAD_SMALL_BYTES = 3 * 1024 * 1024;

const QUALITY = 0.9;

const NEVER_RESIZED = new Set(['image/gif', 'image/svg+xml']);

/** Formats that can have see-through parts, which a JPEG would fill with black. */
const MAY_HAVE_ALPHA = new Set(['image/png', 'image/webp', 'image/avif']);

const EXTENSION_FOR: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Whether a picked file is a photo worth trying to make smaller. */
export function mayDownscale(file: { type: string }): boolean {
  return file.type.startsWith('image/') && !NEVER_RESIZED.has(file.type);
}

/** The size to draw at: the long edge capped at `maxEdge`, never enlarged. */
export function downscaleSize(width: number, height: number, maxEdge = UPLOAD_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The name a re-encoded photo is sent under: its own name, ending in `.jpg`. */
export function jpegName(name: string): string {
  return withExtension(name, '.jpg');
}

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}${extension}`;
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, type === 'image/png' ? undefined : QUALITY));
}

/**
 * A smaller copy of a picked photo, or the file itself when it is already
 * small, cannot be decoded here, or would not come out smaller. A PNG, WebP or
 * AVIF may have see-through parts that a JPEG would fill with black, so it is
 * only resized when it is bigger than the edge, and keeps an alpha channel: a
 * PNG stays PNG, the other two become WebP (or PNG where this browser cannot
 * write WebP).
 */
export async function downscaleForUpload(file: File): Promise<File> {
  if (!mayDownscale(file)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const withinEdge = Math.max(bitmap.width, bitmap.height) <= UPLOAD_MAX_EDGE;
    const keepAlpha = MAY_HAVE_ALPHA.has(file.type);
    // A format the hub does not take (HEIC from some Android phones) is
    // always re-encoded, since sending it as it is would fail anyway.
    const acceptedAsIs = /^image\/(jpeg|png|webp|avif)$/.test(file.type);
    if (acceptedAsIs && withinEdge && (keepAlpha || file.size <= UPLOAD_SMALL_BYTES)) return file;

    const target = downscaleSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const wanted = file.type === 'image/png' ? 'image/png' : keepAlpha ? 'image/webp' : 'image/jpeg';
    const blob = await encode(canvas, wanted);
    if (!blob || (acceptedAsIs && blob.size >= file.size)) return file;
    // A browser that cannot write the format asked for hands back a PNG.
    const type = blob.type || wanted;
    const name = type === 'image/jpeg' ? jpegName(file.name)
      : type === file.type ? file.name
        : withExtension(file.name, EXTENSION_FOR[type] ?? '.jpg');
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
