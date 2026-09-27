// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UploadLibraryResult } from '@/lib/library-client';
import { MAX_IMAGE_BYTES } from '@/lib/media-formats';

type Upload = (file: File, directory: string, onProgress?: (sent: number, total: number) => void) => Promise<UploadLibraryResult>;

const mocks = vi.hoisted(() => ({
  uploadLibraryFile: vi.fn<Upload>(),
  downscaleForUpload: vi.fn<(file: File) => Promise<File>>(),
  isUnplayableVideo: vi.fn<(file: Blob) => Promise<boolean>>(),
}));

vi.mock('@/lib/library-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library-client')>();
  return { libraryFileFromServeUrl: actual.libraryFileFromServeUrl, uploadLibraryFile: mocks.uploadLibraryFile };
});
vi.mock('@/lib/image-downscale', () => ({ downscaleForUpload: mocks.downscaleForUpload }));
vi.mock('@/lib/video-codec', () => ({ isUnplayableVideo: mocks.isUnplayableVideo }));

import { PHONE_VIDEO_MAX_BYTES, usePhotoUploads } from '../usePhotoUploads';

const MB = 1024 * 1024;

/** A picked file; `size` stands in for its real length. */
function pick(name: string, type: string, size?: number): File {
  const file = new File(['x'], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** The hub's answer for a stored file: its serve URL. */
function stored(folder: string, name: string): UploadLibraryResult {
  return { ok: true, status: 201, path: `/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/${name}`)}` };
}

/** Uploads that wait for the test to answer them, in order. */
function heldUploads() {
  const answers: ((result: UploadLibraryResult) => void)[] = [];
  mocks.uploadLibraryFile.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
  return answers;
}

/** Runs `step`, then lets the batch go on until it waits on something the test holds. */
const settle = (step?: () => void) => act(async () => {
  step?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const sentNames = () => mocks.uploadLibraryFile.mock.calls.map(([file]) => file.name);

function setup() {
  const onAdded = vi.fn();
  const view = renderHook(() => usePhotoUploads(onAdded));
  const run = (files: File[]) => act(async () => { await view.result.current.start(files, 'Favorites'); });
  return { ...view, onAdded, run };
}

beforeEach(() => {
  mocks.uploadLibraryFile.mockReset().mockImplementation(async (file, folder) => stored(folder, file.name));
  mocks.downscaleForUpload.mockReset().mockImplementation(async (file) => file);
  mocks.isUnplayableVideo.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
});

describe('usePhotoUploads', () => {
  it('sends files one at a time, in order, and reports each one as it lands', async () => {
    const answers = heldUploads();
    const { result, onAdded } = setup();
    const files = [pick('a.jpg', 'image/jpeg'), pick('b.mp4', 'video/mp4'), pick('c.png', 'image/png')];
    let batch!: Promise<void>;
    await settle(() => { batch = result.current.start(files, 'Favorites'); });

    for (let i = 0; i < files.length; i++) {
      expect(sentNames()).toEqual(files.slice(0, i + 1).map((file) => file.name));
      expect(onAdded).toHaveBeenCalledTimes(i);
      await settle(() => answers[i](stored('Favorites', files[i].name)));
      expect(onAdded).toHaveBeenCalledTimes(i + 1);
    }
    await act(async () => { await batch; });

    expect(mocks.uploadLibraryFile.mock.calls.every(([, folder]) => folder === 'Favorites')).toBe(true);
    expect(result.current.run?.finished).toBe(true);
  });

  it('lists what the finished run added, by library path and kind', async () => {
    const { result, run } = setup();
    await run([pick('a.jpg', 'image/jpeg'), pick('clip.mp4', 'video/mp4')]);

    expect(result.current.run).toMatchObject({
      folder: 'Favorites',
      total: 2,
      current: 2,
      finished: true,
      added: [{ path: 'Favorites/a.jpg', kind: 'image' }, { path: 'Favorites/clip.mp4', kind: 'video' }],
      failures: [],
    });
    expect(result.current.busy).toBe(false);
  });

  it('turns away a file that is not a picture or a video without sending it', async () => {
    const { result, run } = setup();
    await run([pick('menu.pdf', 'application/pdf'), pick('notes', '')]);

    expect(result.current.run?.failures).toEqual([
      { name: 'menu.pdf', problem: 'notMedia' },
      { name: 'notes', problem: 'notMedia' },
    ]);
    expect(mocks.uploadLibraryFile).not.toHaveBeenCalled();
    expect(mocks.downscaleForUpload).not.toHaveBeenCalled();
  });

  it('types a file the picker left untyped from its name, and sends it', async () => {
    const { result, run } = setup();
    await run([pick('clip.mp4', ''), pick('IMG_0042.JPG', '')]);

    expect(mocks.uploadLibraryFile.mock.calls.map(([file]) => [file.name, file.type])).toEqual([
      ['clip.mp4', 'video/mp4'],
      ['IMG_0042.JPG', 'image/jpeg'],
    ]);
    expect(result.current.run?.added).toEqual([
      { path: 'Favorites/clip.mp4', kind: 'video' },
      { path: 'Favorites/IMG_0042.JPG', kind: 'image' },
    ]);
  });

  it('turns away a video over the phone limit without sending it', async () => {
    const { result, run } = setup();
    await run([
      pick('long.mov', 'video/quicktime', PHONE_VIDEO_MAX_BYTES + 1),
      pick('fits.mp4', 'video/mp4', PHONE_VIDEO_MAX_BYTES),
    ]);

    expect(result.current.run?.failures).toEqual([{ name: 'long.mov', problem: 'tooBigVideo' }]);
    expect(sentNames()).toEqual(['fits.mp4']);
    expect(mocks.isUnplayableVideo).toHaveBeenCalledTimes(1);
  });

  it('turns away an HEVC video, which the wall cannot play, without sending it', async () => {
    mocks.isUnplayableVideo.mockResolvedValue(true);
    const { result, run } = setup();
    await run([pick('IMG_0042.MOV', 'video/quicktime')]);

    expect(result.current.run?.failures).toEqual([{ name: 'IMG_0042.MOV', problem: 'wontPlay' }]);
    expect(mocks.uploadLibraryFile).not.toHaveBeenCalled();
  });

  it('turns away a photo still over 10 MB after it was made smaller', async () => {
    mocks.downscaleForUpload.mockImplementation(async (file) =>
      pick(file.name, 'image/jpeg', file.name === 'shrinks.jpg' ? 2 * MB : MAX_IMAGE_BYTES + 1));
    const { result, run } = setup();
    await run([pick('shrinks.jpg', 'image/jpeg', 30 * MB), pick('stays-big.jpg', 'image/jpeg', 30 * MB)]);

    expect(result.current.run?.failures).toEqual([{ name: 'stays-big.jpg', problem: 'tooBigPhoto' }]);
    expect(sentNames()).toEqual(['shrinks.jpg']);
  });

  it('turns away a photo that could not be made into a format the hub takes', async () => {
    const { result, run } = setup();
    await run([pick('IMG_0042.HEIC', 'image/heic')]);

    expect(mocks.downscaleForUpload).toHaveBeenCalledTimes(1);
    expect(result.current.run?.failures).toEqual([{ name: 'IMG_0042.HEIC', problem: 'notMedia' }]);
    expect(mocks.uploadLibraryFile).not.toHaveBeenCalled();
  });

  it('names a refusal for size by kind, and any other refusal as failed', async () => {
    mocks.uploadLibraryFile
      .mockResolvedValueOnce({ ok: false, status: 413, error: 'Too big' })
      .mockResolvedValueOnce({ ok: false, status: 413 })
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'Disk full' })
      .mockResolvedValueOnce({ ok: true, status: 201 }); // stored, but the answer names no file
    const { result, run, onAdded } = setup();
    await run([pick('a.jpg', 'image/jpeg'), pick('b.mp4', 'video/mp4'), pick('c.jpg', 'image/jpeg'), pick('d.jpg', 'image/jpeg')]);

    expect(result.current.run?.failures).toEqual([
      { name: 'a.jpg', problem: 'tooBigPhoto' },
      { name: 'b.mp4', problem: 'tooBigVideo' },
      { name: 'c.jpg', problem: 'failed' },
      { name: 'd.jpg', problem: 'failed' },
    ]);
    expect(result.current.run?.added).toEqual([]);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('counts a dropped upload as failed and carries on with the rest', async () => {
    mocks.uploadLibraryFile.mockRejectedValueOnce(new Error('Upload failed'));
    const { result, run, onAdded } = setup();
    await run([pick('a.jpg', 'image/jpeg'), pick('b.jpg', 'image/jpeg')]);

    expect(result.current.run?.failures).toEqual([{ name: 'a.jpg', problem: 'failed' }]);
    expect(result.current.run?.added).toEqual([{ path: 'Favorites/b.jpg', kind: 'image' }]);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('stops the batch when the session has expired', async () => {
    mocks.uploadLibraryFile.mockRejectedValueOnce(new Error('Session expired'));
    const { result, run, onAdded } = setup();
    await run([pick('a.jpg', 'image/jpeg'), pick('b.jpg', 'image/jpeg')]);

    expect(sentNames()).toEqual(['a.jpg']);
    expect(onAdded).not.toHaveBeenCalled();
    // The login page is on its way, so nothing is reported as failed.
    expect(result.current.run).toMatchObject({ finished: false, failures: [] });
  });

  it('ignores a second batch while one is sending', async () => {
    const answers = heldUploads();
    const { result } = setup();
    let first!: Promise<void>;
    await settle(() => { first = result.current.start([pick('a.jpg', 'image/jpeg')], 'Favorites'); });

    await act(async () => { await result.current.start([pick('b.jpg', 'image/jpeg')], 'Other'); });
    expect(sentNames()).toEqual(['a.jpg']);
    expect(result.current.run).toMatchObject({ folder: 'Favorites', total: 1 });

    await settle(() => answers[0](stored('Favorites', 'a.jpg')));
    await act(async () => { await first; });
    expect(sentNames()).toEqual(['a.jpg']);
    expect(result.current.run?.added).toEqual([{ path: 'Favorites/a.jpg', kind: 'image' }]);
  });

  it('dismiss clears a finished run, but not one still sending', async () => {
    const answers = heldUploads();
    const { result } = setup();
    let batch!: Promise<void>;
    await settle(() => { batch = result.current.start([pick('a.jpg', 'image/jpeg')], 'Favorites'); });

    act(() => result.current.dismiss());
    expect(result.current.run).not.toBeNull();
    expect(result.current.busy).toBe(true);

    await settle(() => answers[0](stored('Favorites', 'a.jpg')));
    await act(async () => { await batch; });
    act(() => result.current.dismiss());
    expect(result.current.run).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('shows progress through the batch, ending at all sent with no bytes left', async () => {
    const answers = heldUploads();
    const { result } = setup();
    let batch!: Promise<void>;
    await settle(() => {
      batch = result.current.start([pick('a.jpg', 'image/jpeg', 1000), pick('b.jpg', 'image/jpeg', 1000)], 'Favorites');
    });
    expect(result.current.run).toMatchObject({ current: 0, progress: 0, bytesLeft: 2000 });

    const onProgress = mocks.uploadLibraryFile.mock.calls[0][2]!;
    act(() => onProgress(500, 1000));
    expect(result.current.run).toMatchObject({ current: 0, progress: 0.25, bytesLeft: 1500 });

    await settle(() => answers[0](stored('Favorites', 'a.jpg')));
    expect(result.current.run).toMatchObject({ current: 1, progress: 0.5, bytesLeft: 1000 });

    await settle(() => answers[1](stored('Favorites', 'b.jpg')));
    await act(async () => { await batch; });
    expect(result.current.run).toMatchObject({ finished: true, current: 2, progress: 1, bytesLeft: 0 });
  });

  it('never counts a file turned away before sending toward the bytes left', async () => {
    const answers = heldUploads();
    const { result } = setup();
    let batch!: Promise<void>;
    await settle(() => {
      batch = result.current.start([
        pick('a.jpg', 'image/jpeg', 1000),
        pick('long.mp4', 'video/mp4', PHONE_VIDEO_MAX_BYTES + 1),
        pick('notes.txt', 'text/plain', 5000),
      ], 'Favorites');
    });
    // Only the photo will go, so only its bytes are left to send.
    expect(result.current.run).toMatchObject({ current: 0, bytesLeft: 1000 });

    await settle(() => answers[0](stored('Favorites', 'a.jpg')));
    await act(async () => { await batch; });
    expect(result.current.run?.failures).toEqual([
      { name: 'long.mp4', problem: 'tooBigVideo' },
      { name: 'notes.txt', problem: 'notMedia' },
    ]);
  });
});
