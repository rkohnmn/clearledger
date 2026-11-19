/**
 * RFC 4180 compliant CSV/TSV parser and financial value normalizer.
 * Runs entirely in-memory with zero external dependencies.
 */

export class CSVParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CSVParseError';
    this.details = details;
  }
}

/**
 * Detect the most likely column delimiter from the first few non-empty lines.
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
  const sampleLines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 8);

  if (sampleLines.length === 0) return ',';

  const candidates = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sampleLines.map((line) => countUnquoted(line, delim));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const first = counts[0];
    const consistency = counts.filter((c) => c === first && c > 0).length;
    const score = consistency * 10 + first;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }
  return bestDelimiter;
}

function countUnquoted(line, delim) {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delim) {
      count += 1;
    }
  }
  return count;
}

/**
 * Parse raw CSV/TSV text into { headers, rows, delimiter, skippedRows }.
 * Automatically skips leading bank metadata preamble rows before the header row.
 * @param {string} rawText
 * @param {{ delimiter?: string }} [options]
 */
export function parseCSV(rawText, options = {}) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new CSVParseError('CSV input is empty.');
  }

  const text = rawText.replace(/^\uFEFF/, '');
  const delimiter = options.delimiter || detectDelimiter(text);
  const matrix = tokenizeCSV(text, delimiter).filter((row) =>
    row.some((cell) => cell.trim().length > 0)
  );

  if (matrix.length < 2) {
    throw new CSVParseError('CSV must contain a header row and at least one transaction row.');
  }

  const headerIndex = findHeaderRowIndex(matrix);
  const rawHeaders = matrix[headerIndex].map((h, i) => {
    const cleaned = h.trim();
    return cleaned.length > 0 ? cleaned : `Column ${i + 1}`;
  });

  const headers = deduplicateHeaders(rawHeaders);
  const rows = [];
  let skippedRows = headerIndex;

  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const line = matrix[r];
    if (line.length === 1 && line[0].trim() === '') {
      skippedRows += 1;
      continue;
    }
    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = (line[c] ?? '').trim();
    }
    rows.push(obj);
  }

  return { headers, rows, delimiter, skippedRows };
}

function tokenizeCSV(text, delimiter) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

function findHeaderRowIndex(matrix) {
  const headerKeywords = /(date|posted|description|merchant|payee|memo|amount|debit|credit|category|balance|type)/i;
  const searchLimit = Math.min(matrix.length - 1, 10);

  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < searchLimit; i += 1) {
    const row = matrix[i];
    if (row.length < 2) continue;
    let keywordMatches = 0;
    let nonNumericCells = 0;
    for (const cell of row) {
      const trimmed = cell.trim();
      if (headerKeywords.test(trimmed)) keywordMatches += 1;
      if (trimmed.length > 0 && Number.isNaN(Number(trimmed.replace(/[$,]/g, '')))) {
        nonNumericCells += 1;
      }
    }
    const score = keywordMatches * 5 + nonNumericCells;
    if (keywordMatches >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function deduplicateHeaders(headers) {
  const seen = new Map();
  return headers.map((header) => {
    const count = seen.get(header) || 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header} (${count + 1})`;
  });
}

/**
 * Parse currency strings including "$1,234.56", "($45.00)", "-45,20 €", "45.00 DR".
 * @param {string | number} raw
 * @returns {number | null}
 */
export function parseAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') return null;

  let value = raw.trim();
  if (value === '' || value === '-' || value === '--') return null;

  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  if (/\b(DR|DEBIT)\b/i.test(value)) {
    negative = true;
    value = value.replace(/\b(DR|DEBIT)\b/gi, '').trim();
  }
  if (/\b(CR|CREDIT)\b/i.test(value)) {
    value = value.replace(/\b(CR|CREDIT)\b/gi, '').trim();
  }

  value = value.replace(/[£$€¥₹CHF\s]/gi, '');
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }

  // Handle European format like "1.234,56" vs US "1,234.56"
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(value)) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(value)) {
    value = value.replace(',', '.');
  } else {
    value = value.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse common bank CSV dates into canonical ISO string "YYYY-MM-DD".
 * @param {string} raw
 * @returns {string | null}
 */
export function parseDate(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO: YYYY-MM-DD or YYYY/MM/DD (with optional timestamp)
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return formatISODate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // Slash or dash: MM/DD/YYYY, M/D/YY, or DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    // If first component > 12, interpret as DD/MM/YYYY; otherwise default to US MM/DD/YYYY
    if (a > 12 && b <= 12) {
      return formatISODate(year, b, a);
    }
    return formatISODate(year, a, b);
  }

  // Named month: "Oct 14, 2026" or "14 Oct 2026"
  const namedUS = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (namedUS) {
    const month = MONTH_MAP[namedUS[1].slice(0, 3).toLowerCase()];
    if (month) return formatISODate(Number(namedUS[3]), month, Number(namedUS[2]));
  }

  const namedEU = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (namedEU) {
    const month = MONTH_MAP[namedEU[2].slice(0, 3).toLowerCase()];
    if (month) return formatISODate(Number(namedEU[3]), month, Number(namedEU[1]));
  }

  return null;
}

function formatISODate(year, month, day) {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
