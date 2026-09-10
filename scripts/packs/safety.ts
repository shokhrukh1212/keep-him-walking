import { readFile } from "node:fs/promises";
import path from "node:path";

export type ContentFinding = { path: string; term: string };

export async function readBannedTerms(root: string): Promise<string[]> {
  const text = await readFile(path.join(root, "docs", "plan", "content-banned-words.txt"), "utf8");
  return text.split(/\r?\n/).map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function findBannedTopics(value: unknown, terms: readonly string[], currentPath = "pack"): ContentFinding[] {
  if (typeof value === "string") {
    const lower = value.toLocaleLowerCase("en");
    return terms.filter((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(lower);
    }).map((term) => ({ path: currentPath, term }));
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => findBannedTopics(item, terms, `${currentPath}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => findBannedTopics(item, terms, `${currentPath}.${key}`));
  }
  return [];
}

export async function lintAuthoredContent(root: string, value: unknown): Promise<ContentFinding[]> {
  return findBannedTopics(value, await readBannedTerms(root));
}
