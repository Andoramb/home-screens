/**
 * A small RFC 4180 CSV reader.
 *
 * There is no CSV dependency in this project and a spreadsheet export does
 * not justify adding one. This covers what real exports actually contain:
 *
 *  - quoted fields, with doubled quotes as the escape ("" inside quotes)
 *  - CR, LF and CRLF line endings, including inside a quoted field
 *  - a leading UTF-8 BOM, which Excel writes and which would otherwise end
 *    up glued to the first header cell
 *  - a ';' separator, which is what Excel writes in locales that use a
 *    comma as the decimal mark (Germany, France, Spain, ...)
 *
 * Malformed input is read as far as it can be rather than thrown away: an
 * unterminated quoted field simply runs to the end of the file, because a
 * half-readable timetable is more useful than an error.
 *
 * Callers cap the size of the result. Hitting a cap is reported in the
 * result instead of silently trimming the data, so the caller can say so.
 */

export interface CsvParseOptions {
  /**
   * Field separator, one character. Omit to sniff ',' against ';' from the
   * first few lines.
   */
  delimiter?: string;
  /** Most rows to return. Default 5000. */
  maxRows?: number;
  /** Most fields to return per row. Default 256. */
  maxColumns?: number;
}

export interface CsvParseResult {
  /** One array of fields per record. Rows are not padded to equal length. */
  rows: string[][];
  /** The separator used, whether it was passed in or sniffed. */
  delimiter: string;
  /** True when the file had more rows than `maxRows` and the rest was dropped. */
  truncatedRows: boolean;
  /** True when at least one row had more fields than `maxColumns`. */
  truncatedColumns: boolean;
}

const DEFAULT_MAX_ROWS = 5000;
const DEFAULT_MAX_COLUMNS = 256;

// How much of the file the separator sniffer looks at. A header row plus a
// few data rows is enough to tell ',' and ';' apart, and stopping early
// keeps the sniff cheap on a large export.
const SNIFF_LINES = 5;
const SNIFF_CHARS = 8192;

/**
 * Count separators outside quoted fields across the first few lines and pick
 * the winner. Ties go to ',' so a single-column file stays comma-separated.
 *
 * A quote only opens a quoted field at the start of one, which is the same rule
 * the parser below follows. Treating any quote as an opener made the two
 * disagree: a stray inch mark in a cell (`12" ruler`) swallowed the rest of the
 * sniff, so a semicolon file was read as comma-separated, every row came back as
 * one column, and a perfectly good sheet was reported as holding no week.
 */
function sniffDelimiter(text: string): string {
  let inQuotes = false;
  // Whether the next character would begin a field, which is the only place a
  // quote may open a quoted one.
  let atFieldStart = true;
  let commas = 0;
  let semicolons = 0;
  let lines = 0;
  const limit = Math.min(text.length, SNIFF_CHARS);
  for (let i = 0; i < limit; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === ',') {
      commas++;
      atFieldStart = true;
    } else if (ch === ';') {
      semicolons++;
      atFieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines++;
      atFieldStart = true;
      if (lines >= SNIFF_LINES) break;
    } else {
      atFieldStart = false;
    }
  }
  return semicolons > commas ? ';' : ',';
}

/** True when anything other than whitespace is left from `from` onwards. */
function hasMoreContent(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    if (!/\s/.test(text[i])) return true;
  }
  return false;
}

/**
 * Parse CSV text into rows.
 *
 * An empty file gives no rows. A trailing line ending does not add an empty
 * row, but a blank line in the middle of the file is kept as a row with one
 * empty field so row numbers still line up with the file. Line endings
 * inside a quoted field are normalised to '\n' so callers never have to
 * strip a stray carriage return.
 */
export function parseCsv(input: string, options: CsvParseOptions = {}): CsvParseResult {
  // An Excel export starts with a BOM. Left in place it becomes part of the
  // first header cell and every header match against it fails.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const delimiter =
    options.delimiter && options.delimiter.length === 1
      ? options.delimiter
      : sniffDelimiter(text);
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // The field opened with a quote, so a quote later in it is an escape and
  // not the start of a quoted section.
  let fieldQuoted = false;
  // Any character at all in the current record, which is how a final record
  // with one empty field is told apart from a trailing line ending.
  let recordStarted = false;
  let truncatedRows = false;
  let truncatedColumns = false;

  const endField = () => {
    if (row.length < maxColumns) row.push(field);
    else truncatedColumns = true;
    field = '';
    fieldQuoted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
        continue;
      }
      if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        field += '\n';
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"' && field === '' && !fieldQuoted) {
      inQuotes = true;
      fieldQuoted = true;
      recordStarted = true;
      continue;
    }

    if (ch === delimiter) {
      endField();
      recordStarted = true;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
      recordStarted = false;
      if (rows.length >= maxRows) {
        truncatedRows = hasMoreContent(text, i + 1);
        break;
      }
      continue;
    }

    field += ch;
    recordStarted = true;
  }

  // A record left open at the end of the file (no trailing line ending, or an
  // unterminated quoted field) is still a row.
  if (recordStarted || field !== '' || row.length > 0) {
    if (rows.length >= maxRows) {
      truncatedRows = true;
    } else {
      endField();
      rows.push(row);
    }
  }

  return { rows, delimiter, truncatedRows, truncatedColumns };
}
