import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { requireApply, requireArgument } from "./lib";

const file = requireArgument("file");
const endpoint = requireArgument("endpoint");
const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
if (!secret) throw new Error("LEMON_SQUEEZY_WEBHOOK_SECRET is required");
const raw = await readFile(file, "utf8");
JSON.parse(raw);
requireApply({ file, endpoint, bytes: Buffer.byteLength(raw), operation: "signed webhook replay" });
const signature = createHmac("sha256", secret).update(raw).digest("hex");
const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": signature }, body: raw });
const result = await response.text();
process.stdout.write(`${JSON.stringify({ status: response.status, response: result.slice(0, 1_000) })}\n`);
