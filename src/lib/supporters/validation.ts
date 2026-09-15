import { z } from "zod";

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableHttpsUrl = z.union([z.literal(""), z.url({ protocol: /^https$/ })]).nullable()
  .transform((value) => value || null);

export const supporterSaveSchema = z.object({
  id: z.number().int().positive().nullable(),
  source: z.enum(["manual", "buy_me_a_coffee"]),
  externalTransactionId: nullableText(200),
  occurredAt: z.iso.datetime({ offset: true }),
  displayName: nullableText(100),
  isAnonymous: z.boolean(),
  coffeeCount: z.number().int().min(1).max(10_000).nullable(),
  xUrl: nullableHttpsUrl,
  xVerified: z.boolean(),
  startupUrl: nullableHttpsUrl,
  startupVerified: z.boolean(),
  privateEmail: z.union([z.literal(""), z.email().max(254)]).nullable().transform((value) => value || null),
  privatePaymentId: nullableText(200),
  privateMessage: nullableText(5_000),
  paymentVerified: z.boolean(),
  acknowledgmentPermission: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.source === "buy_me_a_coffee" && !value.externalTransactionId) {
    context.addIssue({ code: "custom", path: ["externalTransactionId"], message: "A provider transaction ID is required." });
  }
  if (!value.isAnonymous && !value.displayName) {
    context.addIssue({ code: "custom", path: ["displayName"], message: "A public display name is required unless anonymous." });
  }
  if (value.xVerified && !value.xUrl) context.addIssue({ code: "custom", path: ["xVerified"], message: "Add the X link before verifying it." });
  if (value.startupVerified && !value.startupUrl) context.addIssue({ code: "custom", path: ["startupVerified"], message: "Add the startup link before verifying it." });
});

export const supporterActionSchema = z.object({
  action: z.enum(["publish", "unpublish", "remove"]),
}).strict();

const mappingHeader = z.string().min(1).max(200).nullable();
export const supporterImportSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  mapping: z.object({
    transactionId: z.string().min(1).max(200),
    occurredAt: z.string().min(1).max(200),
    displayName: mappingHeader,
    coffeeCount: mappingHeader,
    anonymous: mappingHeader,
    email: mappingHeader,
    paymentId: mappingHeader,
    privateMessage: mappingHeader,
    xUrl: mappingHeader,
    startupUrl: mappingHeader,
  }).strict(),
}).strict();
