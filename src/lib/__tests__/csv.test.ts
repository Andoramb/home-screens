import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/lib/csv';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    const { rows, delimiter } = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(delimiter).toBe(',');
  });

  it('returns no rows for an empty file', () => {
    expect(parseCsv('')).toEqual({
      rows: [],
      delimiter: ',',
      truncatedRows: false,
      truncatedColumns: false,
    });
  });

  it('reads a file that is only a line ending as one blank row', () => {
    // The same rule as a blank line anywhere else: the record is there, it is
    // just empty, and keeping it means row numbers still match the file.
    expect(parseCsv('\n').rows).toEqual([['']]);
    expect(parseCsv('\r\n').rows).toEqual([['']]);
  });

  it('strips a leading UTF-8 BOM from the first field', () => {
    const { rows } = parseCsv('\uFEFFStunde,Montag\n1,Mathe');
    expect(rows[0][0]).toBe('Stunde');
  });

  // ── Quoting ──────────────────────────────────────────────────────────

  it('keeps a separator inside a quoted field', () => {
    const { rows } = parseCsv('a,"b,c",d');
    expect(rows).toEqual([['a', 'b,c', 'd']]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const { rows } = parseCsv('a,"say ""hi""",b');
    expect(rows).toEqual([['a', 'say "hi"', 'b']]);
  });

  it('reads a field that is only a quote', () => {
    expect(parseCsv('a,"""",b').rows).toEqual([['a', '"', 'b']]);
  });

  it('runs an unterminated quoted field to the end of the file', () => {
    // A stray quote is a typo, not a reason to lose the rest of the row.
    expect(parseCsv('a,",b').rows).toEqual([['a', ',b']]);
    expect(parseCsv('"').rows).toEqual([['']]);
  });

  it('treats a quote in the middle of a bare field as a character', () => {
    expect(parseCsv('12" ruler,next').rows).toEqual([['12" ruler', 'next']]);
  });

  it('keeps empty quoted fields empty', () => {
    expect(parseCsv('a,"",b').rows).toEqual([['a', '', 'b']]);
  });

  // ── Line endings ─────────────────────────────────────────────────────

  it('accepts LF, CRLF and lone CR line endings', () => {
    const expected = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    expect(parseCsv('a,b\nc,d').rows).toEqual(expected);
    expect(parseCsv('a,b\r\nc,d').rows).toEqual(expected);
    expect(parseCsv('a,b\rc,d').rows).toEqual(expected);
  });

  it('does not add an empty row for a trailing line ending', () => {
    expect(parseCsv('a,b\nc,d\n').rows).toHaveLength(2);
    expect(parseCsv('a,b\nc,d\r\n').rows).toHaveLength(2);
  });

  it('keeps a blank line in the middle of the file as a row', () => {
    expect(parseCsv('a\n\nb').rows).toEqual([['a'], [''], ['b']]);
  });

  it('keeps a line break inside a quoted field and normalises it', () => {
    expect(parseCsv('a,"one\ntwo",b').rows).toEqual([['a', 'one\ntwo', 'b']]);
    expect(parseCsv('a,"one\r\ntwo",b').rows).toEqual([['a', 'one\ntwo', 'b']]);
    expect(parseCsv('a,"one\rtwo",b').rows).toEqual([['a', 'one\ntwo', 'b']]);
  });

  // ── Separator ────────────────────────────────────────────────────────

  it('detects a semicolon separator, as German Excel writes', () => {
    const text = 'Stunde;Montag;Dienstag\n1;Mathe;Deutsch\n2;Sport;Englisch';
    const { rows, delimiter } = parseCsv(text);
    expect(delimiter).toBe(';');
    expect(rows[1]).toEqual(['1', 'Mathe', 'Deutsch']);
  });

  it('ignores separators inside quotes while sniffing', () => {
    const { delimiter } = parseCsv('"a;b;c;d",x\n"e;f;g;h",y');
    expect(delimiter).toBe(',');
  });

  it('stays with commas when there is nothing to go on', () => {
    expect(parseCsv('single').delimiter).toBe(',');
  });

  it('lets the caller pick the separator', () => {
    const { rows, delimiter } = parseCsv('a;b,c;d', { delimiter: ',' });
    expect(delimiter).toBe(',');
    expect(rows).toEqual([['a;b', 'c;d']]);
  });

  // ── Shape and caps ───────────────────────────────────────────────────

  it('leaves a ragged row ragged', () => {
    const { rows } = parseCsv('a,b,c\nd\ne,f');
    expect(rows).toEqual([['a', 'b', 'c'], ['d'], ['e', 'f']]);
  });

  it('stops at the row cap and says so', () => {
    const text = 'r1\nr2\nr3\nr4';
    const { rows, truncatedRows } = parseCsv(text, { maxRows: 2 });
    expect(rows).toEqual([['r1'], ['r2']]);
    expect(truncatedRows).toBe(true);
  });

  it('does not report truncation when the last row ends the file', () => {
    const { rows, truncatedRows } = parseCsv('r1\nr2\n', { maxRows: 2 });
    expect(rows).toEqual([['r1'], ['r2']]);
    expect(truncatedRows).toBe(false);
  });

  it('reports truncation when the file ends in an unterminated row', () => {
    const { rows, truncatedRows } = parseCsv('r1\nr2\nr3', { maxRows: 2 });
    expect(rows).toEqual([['r1'], ['r2']]);
    expect(truncatedRows).toBe(true);
  });

  it('stops at the column cap and says so', () => {
    const { rows, truncatedColumns } = parseCsv('a,b,c,d\ne,f', { maxColumns: 2 });
    expect(rows).toEqual([
      ['a', 'b'],
      ['e', 'f'],
    ]);
    expect(truncatedColumns).toBe(true);
  });

  it('reports no truncation when everything fits', () => {
    const result = parseCsv('a,b\nc,d', { maxRows: 10, maxColumns: 10 });
    expect(result.truncatedRows).toBe(false);
    expect(result.truncatedColumns).toBe(false);
  });

  // ── A real export ────────────────────────────────────────────────────

  it('reads a timetable export with quoted cells and CRLF endings', () => {
    const text =
      '\uFEFFStunde;Zeit;Montag;Dienstag\r\n'
      + '1;07:50-08:35;"Mathe / A107";Deutsch\r\n'
      + 'Pause;08:35-08:50;;\r\n'
      + '2;08:50-09:35;"Sport;Halle";"Kunst ""neu"""\r\n';
    const { rows, delimiter, truncatedRows, truncatedColumns } = parseCsv(text);
    expect(delimiter).toBe(';');
    expect(rows).toEqual([
      ['Stunde', 'Zeit', 'Montag', 'Dienstag'],
      ['1', '07:50-08:35', 'Mathe / A107', 'Deutsch'],
      ['Pause', '08:35-08:50', '', ''],
      ['2', '08:50-09:35', 'Sport;Halle', 'Kunst "neu"'],
    ]);
    expect(truncatedRows).toBe(false);
    expect(truncatedColumns).toBe(false);
  });
});

describe('parseCsv, a stray quote in the middle of a field', () => {
  it('does not let an inch mark decide the separator', () => {
    // A quote only opens a quoted field at the start of one, which is the rule
    // the parser follows. Treating any quote as an opener made the sniffer
    // swallow the rest of its sample, so a semicolon file was read as
    // comma-separated, every row came back as one column, and a perfectly good
    // sheet was reported as holding no week.
    const text = [
      '12" ruler;Zeit;Mo;Di;Mi',
      '1;07:50;Ma;De;En',
      '2;08:40;Ma;De;En',
    ].join('\n');
    const result = parseCsv(text);
    expect(result.delimiter).toBe(';');
    expect(result.rows[0]).toEqual(['12" ruler', 'Zeit', 'Mo', 'Di', 'Mi']);
  });

  it('still honours a field that really is quoted', () => {
    const result = parseCsv('"a;b";c\n"d";e');
    expect(result.delimiter).toBe(';');
    expect(result.rows[0]).toEqual(['a;b', 'c']);
  });
});
