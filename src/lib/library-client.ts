'use client';

import { editorFetch } from '@/lib/editor-fetch';

/**
 * Client-side counterpart to `library-files.ts` (the server's filesystem
 * plumbing): the media-library wire shapes and mutations shared by the
 * editor's `useImageLibrary` and the /remote Photos tab.
 */

/** One entry of `GET /api/backgrounds/directories`. */
export interface DirectoryInfo {
  name: string;
  path: string;
  imageCount: number;
}

/**
 * Delete a library file given its serve URL
 * (`/api/backgrounds/serve?file=<dir>/<name>`). Returns null without issuing
 * a request when the URL carries no `file` param; otherwise returns the
 * DELETE response for the caller to branch on.
 */
/** The library-relative path a serve URL points at (its `file=` param,
 *  decoded), or null for anything that is not a library serve URL. */
export function libraryFileFromServeUrl(serveUrl: string): string | null {
  return new URL(serveUrl, 'http://localhost').searchParams.get('file') || null;
}

export async function deleteLibraryImage(imageUrl: string): Promise<Response | null> {
  const file = libraryFileFromServeUrl(imageUrl);
  if (!file) return null;

  // Split the library-relative path into directory and basename, which is
  // the shape the DELETE endpoint expects.
  const parts = file.split('/');
  const basename = parts.pop() || '';
  const directory = parts.join('/');

  return editorFetch('/api/backgrounds', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: basename, directory: directory || undefined }),
  });
}
