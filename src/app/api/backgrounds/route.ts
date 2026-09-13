import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import {
  safeLibraryPath,
  writeLibraryFile,
  IMAGE_FILE_RE,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_FILE_RE,
  VIDEO_MIME_TYPES,
} from '@/lib/library-files';
import { mintMediaToken } from '@/lib/media-token';
import { readConfig } from '@/lib/config';
import { scanMediaUsage } from '@/lib/media-usage';
import type { MediaListItem } from '@/types/config';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Helper: resolve a background filename to its serve URL */
function serveUrl(filename: string, directory?: string) {
  const filePath = directory ? `${directory}/${filename}` : filename;
  return `/api/backgrounds/serve?file=${encodeURIComponent(filePath)}`;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const directory = request.nextUrl.searchParams.get('directory') || '';
  const media = request.nextUrl.searchParams.get('media');
  if (media && !['photos', 'videos', 'both'].includes(media)) {
    return NextResponse.json({ error: 'Invalid media parameter' }, { status: 400 });
  }

  // `file=` is a point lookup: resolve one known relative path to a
  // single-item MediaListItem[] (always the typed shape, never the legacy
  // string[]) without enumerating — or minting tokens for — its whole
  // directory. Missing or media-filtered files return [] like an empty list.
  const file = request.nextUrl.searchParams.get('file');
  if (file) {
    const resolved = safeLibraryPath(file);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }
    const isVideo = VIDEO_FILE_RE.test(file);
    const isImage = IMAGE_FILE_RE.test(file);
    const matchesMedia = media === 'videos' ? isVideo : media === 'photos' ? isImage : isVideo || isImage;
    if (!matchesMedia) return NextResponse.json([]);
    try {
      if (!(await fs.stat(resolved)).isFile()) return NextResponse.json([]);
    } catch {
      return NextResponse.json([]);
    }
    let url = `/api/backgrounds/serve?file=${encodeURIComponent(file)}`;
    if (isVideo) {
      // Bind the token to the same `file` value the serve route reads back.
      const token = await mintMediaToken(file);
      if (token) url += `&mt=${encodeURIComponent(token)}`;
    }
    const item: MediaListItem = { url, type: isVideo ? 'video' : 'image' };
    return NextResponse.json([item]);
  }

  let dir: string;
  if (directory) {
    const resolved = safeLibraryPath(directory);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
    }
    dir = resolved;
  } else {
    dir = BGS;
  }

  // Only auto-create the root directory; subdirectories must already exist
  if (!directory) {
    await fs.mkdir(dir, { recursive: true });
  } else {
    try {
      await fs.access(dir);
    } catch {
      return NextResponse.json([], { status: 200 });
    }
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  // No media param → legacy string[] of image URLs, exactly as before videos existed.
  if (!media) {
    const paths = files
      .filter((name) => IMAGE_FILE_RE.test(name))
      .map((name) => serveUrl(name, directory || undefined));
    return NextResponse.json(paths);
  }

  const items: MediaListItem[] = [];
  for (const name of files) {
    if (IMAGE_FILE_RE.test(name) && media !== 'videos') {
      items.push({ url: serveUrl(name, directory || undefined), type: 'image' });
    } else if (VIDEO_FILE_RE.test(name) && media !== 'photos') {
      // Bind the token to the same `file` value the serve route reads back.
      const filePath = directory ? `${directory}/${name}` : name;
      const token = await mintMediaToken(filePath);
      const url = serveUrl(name, directory || undefined) + (token ? `&mt=${encodeURIComponent(token)}` : '');
      items.push({ url, type: 'video' });
    }
  }
  return NextResponse.json(items);
}, 'Failed to list backgrounds');

export const POST = withAuth(async (request: NextRequest) => {
  // Reject oversized uploads before parsing: a genuinely oversized multipart
  // body makes request.formData() throw (surfacing as a 500), so the per-file
  // 413 below never runs for them. Capping the whole body at the video max
  // keeps "max 200 MB" truthful; the few hundred bytes of multipart overhead
  // only shave a byte-exact 200 MB file, which the friendly message still covers.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'File too large (max 200 MB)' }, { status: 413 });
  }

  const formData = await request.formData();
  const directory = (formData.get('directory') as string) || '';

  let dir: string;
  if (directory) {
    const resolved = safeLibraryPath(directory);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
    }
    dir = resolved;
  } else {
    dir = BGS;
  }

  const files = formData.getAll('file') as File[];

  if (files.length === 0 || !files[0]?.name) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate all files first
  for (const file of files) {
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    if (!isVideo && !IMAGE_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.name}` }, { status: 400 });
    }
    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const maxLabel = isVideo ? '200 MB' : '10 MB';
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large: ${file.name} (max ${maxLabel})` }, { status: 413 });
    }
  }

  await fs.mkdir(dir, { recursive: true });

  const uploadedPaths: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(dir, safeName);
    // Stream to disk in chunks. formData() above already holds the one
    // unavoidable in-memory copy; buffering again via arrayBuffer() would
    // peak at 2-3x the file size, enough to OOM a Pi hub on a 200 MB video.
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    await writeLibraryFile(filePath, file.stream(), isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
    uploadedPaths.push(serveUrl(safeName, directory || undefined));
  }

  if (files.length === 1) {
    return NextResponse.json({ path: uploadedPaths[0] }, { status: 201 });
  }

  return NextResponse.json({ paths: uploadedPaths }, { status: 201 });
}, 'Failed to upload background');

export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ file?: unknown; directory?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { file, directory } = body;
  if (!file || typeof file !== 'string') {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  // Resolve file within optional directory
  const relativePath = directory ? `${directory}/${path.basename(file)}` : path.basename(file);
  const filePath = safeLibraryPath(relativePath);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Refuse to delete a file the config still references somewhere: a stale
  // page or a quick edit must never be able to remove a picture or video
  // something still shows. The readConfig() read is serialized with editor
  // config saves through the shared data-transaction coordinator (PUT
  // /api/config takes the same queue), so the residual race is only the
  // sub-millisecond disk timing between the read's lock release and the
  // unlink — wrapping the unlink would not improve it.
  const config = await readConfig();
  const usage = scanMediaUsage(config, new Set([relativePath])).get(relativePath);
  if (usage) {
    return NextResponse.json({ error: 'in use', usage }, { status: 409 });
  }
  // Deliberately conservative backstop for hand-placed spaced filenames: the
  // scanner reads bare paths containing spaces as prose, so one can slip past
  // the scan above. Refuse when the serialized config contains the path as a
  // complete quoted JSON string (the quote boundaries are what keep a longer
  // path like nature/a.jpg from matching a.jpg) or in its percent-encoded
  // serve form (spaces %20, slashes %2F) — the latter's real coverage is
  // serve URLs malformed enough that the scanner's regex misses them (a
  // missing /api prefix, an absolute-origin prefix). These checks only ever
  // add refusals, never permissions.
  const serialized = JSON.stringify(config);
  if (
    serialized.includes(`"${relativePath}"`) ||
    serialized.includes(`file=${encodeURIComponent(relativePath)}`)
  ) {
    return NextResponse.json({ error: 'in use', usage: [] }, { status: 409 });
  }

  await fs.unlink(filePath);
  return NextResponse.json({ deleted: path.basename(file) });
}, 'Failed to delete background');
