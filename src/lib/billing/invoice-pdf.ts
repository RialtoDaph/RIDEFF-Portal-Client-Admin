import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatMoney } from "@/lib/format";
import type { Bank, Seller } from "./settings";

// German invoice (§14 Abs. 4 UStG): seller and recipient name and address, tax number or VAT ID,
// invoice date, consecutive number, quantity and type of service, service date or period,
// net amount, tax rate, tax amount, gross amount. Always German.
//
// Labels from the prototype: Rechnung, Datum, An, Posten, Betrag netto, Zwischensumme, MwSt. 19 %, Gesamt, Bezahlt, Offen.
// PROPOSED (not in the prototype, waiting for the owner's OK): Leistungsdatum, Leistungszeitraum,
// Steuernummer / USt-IdNr., Zahlbar bis, Bezahlt am, Bankverbindung.
const L = {
  invoice: "Rechnung",
  date: "Datum:",
  to: "An",
  item: "Posten",
  net: "Betrag netto",
  subtotal: "Zwischensumme",
  vat: "MwSt. 19 %",
  total: "Gesamt",
  serviceDate: "Leistungsdatum:",
  servicePeriod: "Leistungszeitraum:",
  taxId: "Steuernummer / USt-IdNr.:",
  dueBy: "Zahlbar bis",
  paidOn: "Bezahlt am",
  bank: "Bankverbindung",
};

export type InvoicePdfData = {
  number: string;
  issuedOn: string;
  serviceFrom: string | null;
  serviceTo: string | null;
  dueOn: string | null;
  description: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
  status: "open" | "announced" | "paid" | "overdue";
  paidAt: string | null;
  recipient: { name: string; contact: string | null; street: string | null; postalCode: string | null; city: string | null; country: string };
  seller: Seller;
  bank: Bank;
};

const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.4, 0.4, 0.42);
const LINE = rgb(0.83, 0.83, 0.82);
const fontDir = path.join(process.cwd(), "node_modules/geist/dist/fonts");
const de = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold, mono] = await Promise.all([
    readFile(path.join(fontDir, "geist-sans/Geist-Regular.ttf")).then((b) => doc.embedFont(b, { subset: true })),
    readFile(path.join(fontDir, "geist-sans/Geist-Bold.ttf")).then((b) => doc.embedFont(b, { subset: true })),
    readFile(path.join(fontDir, "geist-mono/GeistMono-Regular.ttf")).then((b) => doc.embedFont(b, { subset: true })),
  ]);
  doc.setTitle(`${L.invoice} ${d.number}`);
  doc.setAuthor(d.seller.name);
  doc.setCreationDate(new Date(d.issuedOn + "T12:00:00Z"));
  doc.setModificationDate(new Date(d.issuedOn + "T12:00:00Z"));

  const W = 595.28, H = 841.89, X = 56, R = W - 56;
  const page: PDFPage = doc.addPage([W, H]);
  let y = H - 64;
  const text = (t: string, x: number, size: number, font: PDFFont, color = INK) => page.drawText(t, { x, y, size, font, color });
  const right = (t: string, size: number, font: PDFFont, color = INK, edge = R) => text(t, edge - font.widthOfTextAtSize(t, size), size, font, color);
  const rule = () => page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.75, color: LINE });
  const eur = (c: number) => formatMoney(c, "de", { cents: true });

  text("RIDEFF", X, 20, bold);
  y -= 16;
  const sellerLine = [d.seller.name, d.seller.street, d.seller.city, d.seller.email].filter(Boolean).join(" · ");
  text(sellerLine, X, 8, regular, MUTED);

  // recipient (left) and invoice data (right)
  y -= 52;
  const top = y;
  text(L.to, X, 9, bold);
  y -= 15;
  for (const line of [d.recipient.name, d.recipient.contact, d.recipient.street, [d.recipient.postalCode, d.recipient.city].filter(Boolean).join(" "), d.recipient.country !== "DE" ? d.recipient.country : null]) {
    if (!line) continue;
    text(line, X, 10, regular);
    y -= 14;
  }
  y = top;
  const meta: [string, string][] = [
    [L.date, de(d.issuedOn)],
    d.serviceFrom && d.serviceTo && d.serviceFrom !== d.serviceTo
      ? [L.servicePeriod, `${de(d.serviceFrom)} – ${de(d.serviceTo)}`]
      : [L.serviceDate, de(d.serviceFrom ?? d.issuedOn)],
  ];
  for (const [k, v] of meta) {
    right(v, 9.5, mono);
    text(k, 330, 9.5, regular, MUTED);
    y -= 15;
  }

  y = top - 110;
  text(`${L.invoice} ${d.number}`, X, 18, bold);
  y -= 34;
  text(L.item, X, 9, bold, MUTED);
  right(L.net, 9, bold, MUTED);
  y -= 10;
  rule();
  y -= 18;
  text(d.description, X, 11, regular);
  right(eur(d.netCents), 10.5, mono);
  y -= 12;
  rule();

  const totals: [string, string, PDFFont, number][] = [
    [L.subtotal, eur(d.netCents), regular, 10],
    [L.vat, eur(d.vatCents), regular, 10],
    [L.total, eur(d.grossCents), bold, 12],
  ];
  y -= 22;
  for (const [k, v, f, s] of totals) {
    text(k, 330, s, f);
    right(v, s, f === bold ? bold : mono);
    y -= s + 8;
  }

  y -= 20;
  if (d.status === "paid" && d.paidAt) text(`${L.paidOn} ${de(d.paidAt)}`, X, 10, regular);
  else if (d.dueOn) text(`${L.dueBy} ${de(d.dueOn)}`, X, 10, regular);

  // footer: tax number and bank details
  y = 96;
  page.drawLine({ start: { x: X, y: y + 14 }, end: { x: R, y: y + 14 }, thickness: 0.75, color: LINE });
  text(`${L.taxId} ${d.seller.taxId}`, X, 8, regular, MUTED);
  y -= 13;
  text(`${L.bank}: ${d.bank.recipient} · IBAN ${d.bank.iban} · BIC ${d.bank.bic} · ${d.bank.bank}`, X, 8, regular, MUTED);
  return doc.save({ useObjectStreams: false });
}
