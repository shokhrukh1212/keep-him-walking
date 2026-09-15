export type CsvDocument = {
  headers: string[];
  rows: Record<string, string>[];
};

export type SupporterImportMapping = {
  transactionId: string;
  occurredAt: string;
  displayName: string | null;
  coffeeCount: string | null;
  anonymous: string | null;
  email: string | null;
  paymentId: string | null;
  privateMessage: string | null;
  xUrl: string | null;
  startupUrl: string | null;
};

export type ImportedSupporter = {
  externalTransactionId: string;
  occurredAt: string;
  displayName: string | null;
  coffeeCount: number | null;
  isAnonymous: boolean;
  privateEmail: string | null;
  privatePaymentId: string | null;
  privateMessage: string | null;
  xUrl: string | null;
  startupUrl: string | null;
};

function csvCells(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell);
    rows.push(row);
  }
  return rows;
}

/** Parses an export for preview only. No provider column names are assumed. */
export function parseCsv(input: string): CsvDocument {
  const parsed = csvCells(input.replace(/^\uFEFF/, ""));
  const headers = parsed.shift()?.map((header) => header.trim()) ?? [];
  if (headers.length < 2 || headers.some((header) => !header)) throw new Error("The CSV needs a non-empty header row.");
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column names.");
  const rows = parsed
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} cells; expected ${headers.length}.`);
      return Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ""]));
    });
  if (rows.length === 0) throw new Error("The CSV contains no transactions.");
  return { headers, rows };
}

function optional(row: Record<string, string>, header: string | null): string | null {
  if (!header) return null;
  const value = row[header]?.trim() ?? "";
  return value || null;
}

function affirmative(value: string | null): boolean {
  return value ? /^(1|true|yes|y|anonymous)$/i.test(value.trim()) : false;
}

export function mapSupporterExport(document: CsvDocument, mapping: SupporterImportMapping): ImportedSupporter[] {
  const chosen = Object.values(mapping).filter((header): header is string => header !== null);
  if (chosen.some((header) => !document.headers.includes(header))) throw new Error("A mapped column is not present in this export.");
  return document.rows.map((row, index) => {
    const transactionId = optional(row, mapping.transactionId);
    const rawDate = optional(row, mapping.occurredAt);
    if (!transactionId) throw new Error(`CSV row ${index + 2} has no transaction ID.`);
    if (!rawDate) throw new Error(`CSV row ${index + 2} has no contribution date.`);
    const date = new Date(rawDate);
    if (!Number.isFinite(date.getTime())) throw new Error(`CSV row ${index + 2} has an unreadable contribution date.`);
    const rawCount = optional(row, mapping.coffeeCount);
    const coffeeCount = rawCount === null ? null : Number(rawCount);
    if (coffeeCount !== null && (!Number.isSafeInteger(coffeeCount) || coffeeCount < 1 || coffeeCount > 10_000)) {
      throw new Error(`CSV row ${index + 2} has an invalid coffee count.`);
    }
    const displayName = optional(row, mapping.displayName);
    return {
      externalTransactionId: transactionId,
      occurredAt: date.toISOString(),
      displayName,
      coffeeCount,
      isAnonymous: affirmative(optional(row, mapping.anonymous)) || displayName === null,
      privateEmail: optional(row, mapping.email),
      privatePaymentId: optional(row, mapping.paymentId),
      privateMessage: optional(row, mapping.privateMessage),
      xUrl: optional(row, mapping.xUrl),
      startupUrl: optional(row, mapping.startupUrl),
    };
  });
}
