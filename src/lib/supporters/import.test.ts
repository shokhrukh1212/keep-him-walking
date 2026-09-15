import { describe, expect, it } from "vitest";
import { mapSupporterExport, parseCsv, type SupporterImportMapping } from "./import";

const mapping: SupporterImportMapping = {
  transactionId: "Transaction",
  occurredAt: "Date",
  displayName: "Name",
  coffeeCount: "Coffees",
  anonymous: "Anonymous",
  email: "Email",
  paymentId: null,
  privateMessage: "Message",
  xUrl: null,
  startupUrl: null,
};

describe("supporter export import", () => {
  it("parses quoted commas and newlines without assuming provider headers", () => {
    const csv = 'Transaction,Date,Name,Coffees,Anonymous,Email,Message\r\n' +
      'tx-1,2034-01-02T10:00:00Z,"Alex, Jr",3,no,alex@example.test,"Line one\nline two"\r\n';
    const document = parseCsv(csv);
    expect(document.headers).toEqual(["Transaction", "Date", "Name", "Coffees", "Anonymous", "Email", "Message"]);
    expect(document.rows[0]?.Message).toBe("Line one\nline two");
    expect(mapSupporterExport(document, mapping)).toEqual([expect.objectContaining({
      externalTransactionId: "tx-1",
      occurredAt: "2034-01-02T10:00:00.000Z",
      displayName: "Alex, Jr",
      coffeeCount: 3,
      isAnonymous: false,
      privateEmail: "alex@example.test",
      privateMessage: "Line one\nline two",
    })]);
  });

  it("keeps an unavailable count null and respects anonymous rows", () => {
    const document = parseCsv("Transaction,Date,Name,Coffees,Anonymous,Email,Message\n tx-2,2034-01-03,,,,,");
    const [row] = mapSupporterExport(document, mapping);
    expect(row).toEqual(expect.objectContaining({ coffeeCount: null, displayName: null, isAnonymous: true }));
  });

  it("rejects malformed files and invalid exact counts", () => {
    expect(() => parseCsv("only-one-header\nvalue")).toThrow(/header/i);
    const document = parseCsv("Transaction,Date,Name,Coffees,Anonymous,Email,Message\ntx,2034-01-03,Alex,2.5,no,,");
    expect(() => mapSupporterExport(document, mapping)).toThrow(/coffee count/i);
  });
});
