import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, type QueryResult } from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is required");

const testsDirectory = path.join(process.cwd(), "supabase/tests/database");
const files = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".test.sql"))
  .sort();
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: "keep-him-walking-database-tests",
});

try {
  await client.connect();
  for (const file of files) {
    const sql = await readFile(path.join(testsDirectory, file), "utf8");
    const rawResults = await client.query(sql);
    const results = (Array.isArray(rawResults) ? rawResults : [rawResults]) as QueryResult[];
    const tapLines = results.flatMap((result) =>
      result.rows.flatMap((row) => Object.values(row).filter((value): value is string => typeof value === "string")),
    );
    const failures = tapLines.filter((line) => /^not ok\b/i.test(line.trim()));
    if (failures.length > 0) {
      throw new Error(`${file} failed:\n${failures.join("\n")}`);
    }
    const passed = tapLines.filter((line) => /^ok\b/i.test(line.trim())).length;
    process.stdout.write(`${file}: ${passed} assertions passed\n`);
  }
} finally {
  await client.end().catch(() => undefined);
}
