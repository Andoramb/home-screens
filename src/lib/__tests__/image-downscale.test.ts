// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UPLOAD_MAX_EDGE,
  UPLOAD_SMALL_BYTES,
  downscaleForUpload,
  downscaleSize,
  jpegName,
  mayDownscale,
} from '@/lib/image-downscale';

const MB = 1024 * 1024;

describe('mayDownscale', () => {
  it.each(['image/jpeg', 'image/png', 'image/heic'])('tries %s', (type) => {
    expect(mayDownscale({ type })).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'video/mp4'])('leaves %s alone', (type) => {
    expect(mayDownscale({ type })).toBe(false);
  });
});

describe('downscaleSize', () => {
  it('caps the long edge at 3840 px, landscape or portrait', () => {
    expect(downscaleSize(6000, 4000)).toEqual({ width: 3840, height: 2560 });
    expect(downscaleSize(3000, 6000)).toEqual({ width: 1920, height: 3840 });
  });

  it('never enlarges', () => {
    expect(downscaleSize(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(downscaleSize(UPLOAD_MAX_EDGE, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  it('keeps the shape, and at least one pixel on the short side', () => {
    expect(downscaleSize(8064, 6048)).toEqual({ width: 3840, height: 2880 });
    expect(downscaleSize(20000, 2)).toEqual({ width: 3840, height: 1 });
  });

  it('takes another edge', () => {
    expect(downscaleSize(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(downscaleSize(800, 600, 1000)).toEqual({ width: 800, height: 600 });
  });
});

describe('jpegName', () => {
  it('swaps the extension for .jpg', () => {
    expect(jpegName('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(jpegName('beach.png')).toBe('beach.jpg');
  });

  it('adds .jpg to a name without an extension', () => {
    expect(jpegName('beach')).toBe('beach.jpg');
    expect(jpegName('.hidden')).toBe('.hidden.jpg');
  });

  it('keeps dots inside the name', () => {
    expect(jpegName('trip.2026.07.beach.jpeg')).toBe('trip.2026.07.beach.jpg');
  });
});

describe('downscaleForUpload', () => {
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
  let context: { drawImage: ReturnType<typeof vi.fn>; imageSmoothingQuality: string } | null;
  /** What each encode was asked for. */
  let encodes: { type?: string; quality?: number }[];
  /** How many bytes the encoder hands back, or null for no blob at all. */
  let encodedBytes: number | null;
  /** The type the encoder really writes, when it cannot write the one asked for. */
  let encodedType: string | null;
  const decode = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((done: BlobCallback, type?: string, quality?: number) => {
      encodes.push({ type, quality });
      done(encodedBytes === null ? null : new Blob([new Uint8Array(encodedBytes)], { type: encodedType ?? type }));
    }),
  };

  function picture(width: number, height: number) {
    bitmap = { width, height, close: vi.fn() };
  }

  function photo(name: string, type: string, bytes: number): File {
    const file = new File([new Uint8Array(16)], name, { type, lastModified: 1_700_000_000_000 });
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
  }

  beforeEach(() => {
    picture(1000, 1000);
    context = { drawImage: vi.fn(), imageSmoothingQuality: '' };
    encodes = [];
    encodedBytes = MB;
    encodedType = null;
    canvas.width = 0;
    canvas.height = 0;
    canvas.toBlob.mockClear();
    decode.mockReset().mockImplementation(async () => bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) =>
      tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : createElement(tag, options));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends a GIF as it is without decoding it', async () => {
    const gif = photo('party.gif', 'image/gif', 12 * MB);
    expect(await downscaleForUpload(gif)).toBe(gif);
    expect(decode).not.toHaveBeenCalled();
  });

  it('sends a JPEG already within the edge and 3 MB as it is', async () => {
    picture(3840, 2160);
    const small = photo('hall.jpg', 'image/jpeg', UPLOAD_SMALL_BYTES);
    expect(await downscaleForUpload(small)).toBe(small);
    expect(decode).toHaveBeenCalledWith(small, { imageOrientation: 'from-image' });
    expect(encodes).toEqual([]);
  });

  it('redraws a 6000x4000 JPEG at 3840x2560 and sends the copy as a JPEG', async () => {
    picture(6000, 4000);
    encodedBytes = 2 * MB;
    const original = photo('IMG_0042.jpeg', 'image/jpeg', 9 * MB);

    const sent = await downscaleForUpload(original);

    expect(sent).not.toBe(original);
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe('IMG_0042.jpg');
    expect(sent.type).toBe('image/jpeg');
    expect(sent.size).toBe(2 * MB);
    expect(sent.lastModified).toBe(original.lastModified);
    expect([canvas.width, canvas.height]).toEqual([3840, 2560]);
    expect(context!.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 3840, 2560);
    expect(context!.imageSmoothingQuality).toBe('high');
    expect(encodes).toEqual([{ type: 'image/jpeg', quality: 0.9 }]);
  });

  it('sends a PNG within the edge as it is, however many bytes it has', async () => {
    picture(3000, 2000);
    const png = photo('drawing.png', 'image/png', 9 * MB);
    expect(await downscaleForUpload(png)).toBe(png);
    expect(encodes).toEqual([]);
  });

  it('redraws a PNG over the edge and keeps it a PNG under its own name', async () => {
    picture(7680, 4320);
    encodedBytes = 3 * MB;
    const png = photo('screenshot.png', 'image/png', 8 * MB);

    const sent = await downscaleForUpload(png);

    expect(sent).not.toBe(png);
    expect(sent.name).toBe('screenshot.png');
    expect(sent.type).toBe('image/png');
    expect([canvas.width, canvas.height]).toEqual([3840, 2160]);
    expect(encodes).toHaveLength(1);
    expect(encodes[0].type).toBe('image/png');
    expect(encodes[0].quality).toBeUndefined();
  });

  it('keeps a WebP within the edge as it is, since it may have see-through parts', async () => {
    picture(3000, 2000);
    const webp = photo('sticker.webp', 'image/webp', 6 * MB);
    expect(await downscaleForUpload(webp)).toBe(webp);
    expect(encodes).toEqual([]);
  });

  it('redraws a WebP over the edge as a WebP, never a JPEG', async () => {
    picture(8000, 6000);
    encodedBytes = 2 * MB;
    const webp = photo('panorama.webp', 'image/webp', 7 * MB);

    const sent = await downscaleForUpload(webp);

    expect(sent.name).toBe('panorama.webp');
    expect(sent.type).toBe('image/webp');
    expect(encodes).toEqual([{ type: 'image/webp', quality: 0.9 }]);
  });

  it('names the copy after what the browser wrote when it cannot write WebP', async () => {
    picture(8000, 6000);
    encodedBytes = 2 * MB;
    encodedType = 'image/png';
    const avif = photo('glass.avif', 'image/avif', 7 * MB);

    const sent = await downscaleForUpload(avif);

    expect(sent.name).toBe('glass.png');
    expect(sent.type).toBe('image/png');
  });

  it('sends the original when this browser cannot decode it', async () => {
    decode.mockRejectedValue(new Error('The source image could not be decoded.'));
    const original = photo('IMG_0042.jpg', 'image/jpeg', 9 * MB);
    expect(await downscaleForUpload(original)).toBe(original);
    expect(encodes).toEqual([]);
  });

  it.each([
    ['bigger', 5 * MB],
    ['the same size', 4 * MB],
  ])('sends the original when the copy comes out %s', async (_, bytes) => {
    picture(3000, 2000);
    encodedBytes = bytes;
    const original = photo('IMG_0042.jpg', 'image/jpeg', 4 * MB);
    expect(await downscaleForUpload(original)).toBe(original);
    expect(encodes).toHaveLength(1);
  });

  it('turns a HEIC photo within the edge into a JPEG even when the copy is bigger, since the hub does not take HEIC', async () => {
    picture(2880, 3840);
    encodedBytes = 3 * MB;
    const heic = photo('IMG_0042.HEIC', 'image/heic', 2 * MB);

    const sent = await downscaleForUpload(heic);

    expect(sent.name).toBe('IMG_0042.jpg');
    expect(sent.type).toBe('image/jpeg');
    expect(sent.size).toBe(3 * MB);
    expect(context!.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2880, 3840);
  });

  const outcomes: [string, () => File, boolean][] = [
    ['sends it as it is', () => {
      picture(1000, 800);
      return photo('a.jpg', 'image/jpeg', MB);
    }, true],
    ['sends a smaller copy', () => {
      picture(6000, 4000);
      return photo('a.jpg', 'image/jpeg', 9 * MB);
    }, false],
    ['finds the copy bigger', () => {
      picture(3000, 2000);
      encodedBytes = 5 * MB;
      return photo('a.jpg', 'image/jpeg', 4 * MB);
    }, true],
    ['gets no canvas to draw on', () => {
      picture(6000, 4000);
      context = null;
      return photo('a.jpg', 'image/jpeg', 9 * MB);
    }, true],
    ['gets nothing from the encoder', () => {
      picture(6000, 4000);
      encodedBytes = null;
      return photo('a.jpg', 'image/jpeg', 9 * MB);
    }, true],
    ['sees the encoder throw', () => {
      picture(6000, 4000);
      canvas.toBlob.mockImplementationOnce(() => {
        throw new Error('canvas is tainted');
      });
      return photo('a.jpg', 'image/jpeg', 9 * MB);
    }, true],
  ];

  it.each(outcomes)('closes the decoded picture when it %s', async (_, pick, sendsOriginal) => {
    const original = pick();
    const sent = await downscaleForUpload(original);
    expect(sent === original).toBe(sendsOriginal);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
