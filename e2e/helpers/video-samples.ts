/**
 * Tiny MP4 files for upload tests: only the boxes a codec check reads (the
 * file type, then the movie down to its sample description), no frames. The
 * phone and Settings read them to turn HEVC away before sending; the hub
 * stores anything else like any other video, and nothing ever decodes them.
 */

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, body]);
}

/** A sample description with one entry in `format`. */
function stsd(format: string): Buffer {
  const entry = Buffer.alloc(24);
  entry.writeUInt32BE(entry.length, 0);
  entry.write(format, 4, 'ascii');
  return box('stsd', Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), entry);
}

/** An MP4 whose one video track is `hvc1` (HEVC, which the wall cannot play) or `avc1` (H.264). */
export function mp4WithVideo(format: 'hvc1' | 'avc1'): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isom'));
  const trak = box('trak', box('mdia', box('minf', box('stbl', stsd(format)))));
  return Buffer.concat([ftyp, box('moov', box('mvhd', Buffer.alloc(100)), trak)]);
}
