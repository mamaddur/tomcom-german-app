import ExcelJS from 'exceljs';
import { ApiError } from '../common/api-error.js';

export const MAX_ROSTER_BYTES = 1024 * 1024;
export const MAX_ROSTER_ROWS = 2000;

/** Header names that mark the phone column (English and Telugu). */
const PHONE_HEADERS = /^(phone|mobile|phone number|mobile number|ఫోన్|మొబైల్|ఫోన్ నంబర్)$/i;

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // zip

/**
 * FR-901: reads the phone numbers from an uploaded learner list (CSV or Excel). Only the phone
 * column is read; any other columns (names, notes) are ignored and never stored.
 * Returns one entry per data row, with its 1-based row number in the file.
 */
export async function readRoster(
  file: Buffer,
  filename: string,
): Promise<Array<{ row: number; value: string }>> {
  if (file.length > MAX_ROSTER_BYTES) throw new ApiError(413, 'file_too_large');
  const isXlsx = file.subarray(0, 4).equals(XLSX_MAGIC);
  if (!isXlsx && !/\.csv$/i.test(filename)) throw new ApiError(415, 'unsupported_file');
  const rows = isXlsx ? await xlsxRows(file) : csvRows(file.toString('utf8'));
  if (rows.length === 0) return [];

  const header = rows[0]!.map((c) => c.trim());
  const named = header.findIndex((h) => PHONE_HEADERS.test(h));
  const column = named >= 0 ? named : 0;
  const start = named >= 0 ? 1 : 0;
  const out: Array<{ row: number; value: string }> = [];
  for (let i = start; i < rows.length; i++) {
    const value = (rows[i]![column] ?? '').trim();
    if (value) out.push({ row: i + 1, value });
  }
  if (out.length > MAX_ROSTER_ROWS)
    throw new ApiError(413, 'too_many_rows', { max: MAX_ROSTER_ROWS });
  return out;
}

/** Plain CSV: comma or semicolon, optional double quotes. Enough for a one-column list. */
function csvRows(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, MAX_ROSTER_ROWS + 2)
    .map((line) => line.split(/[,;]/).map((c) => c.replace(/^"|"$/g, '')));
}

async function xlsxRows(file: Buffer): Promise<string[][]> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(415, 'unsupported_file');
  }
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  if (sheet.rowCount > MAX_ROSTER_ROWS + 1) {
    throw new ApiError(413, 'too_many_rows', { max: MAX_ROSTER_ROWS });
  }
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      // Phone numbers typed into Excel often become numbers; read the shown text.
      cells[col - 1] = cell.text ?? '';
    });
    rows.push(cells);
  });
  return rows;
}
