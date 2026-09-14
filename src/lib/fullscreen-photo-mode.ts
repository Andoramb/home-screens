/**
 * The one definition of a fullscreen-photo module's mode. A `file` key that
 * is present, even as an empty string, means single-photo mode (the editor
 * writes `''` when the user switches to it and has not picked yet); only an
 * absent key means the folder slideshow. The renderer, the editor's config
 * section and the media usage scan all ask this, so they cannot disagree
 * about whether a folder is being shown.
 */
export function isSinglePhotoMode(config: { file?: unknown }): boolean {
  return config.file !== undefined;
}
