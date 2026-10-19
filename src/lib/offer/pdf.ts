import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import de from "../../../messages/de.json";
import { formatMoney } from "@/lib/format";
import { OFFER_GROUPS, isOfferGroup } from "./catalog";

// The snapshot is the legal record of the accepted quote, so it is always German (canonical copy),
// laid out like the warm-paper document. Its SHA-256 is stored with the acceptance.

const INK = rgb(0x1c / 255, 0x19 / 255, 0x17 / 255);
const MUTED = rgb(0x57 / 255, 0x53 / 255, 0x4e / 255);
const LINE = rgb(0xcf / 255, 0xc9 / 255, 0xbf / 255);
const PAPER = rgb(0xe7 / 255, 0xe3 / 255, 0xdc / 255);
const BRAND = rgb(1, 0x6a / 255, 0);

export type OfferSnapshot = {
  number: string;
  orgName: string;
  packageName: string;
  setupCents: number;
  monthlyCents: number;
  termMonths: number;
  groups: string[];
  acceptance: { at: string; by: string; email: string; ip: string; agbVersion: string };
};

const fontDir = path.join(process.cwd(), "node_modules/geist/dist/fonts");
const m = de as unknown as { offer: Record<string, unknown>; money: Record<string, string>; common: Record<string, string> };
const group = (key: string) => (m.offer.group as Record<string, Record<string, string>>)[key];

export async function buildOfferPdf(s: OfferSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold, mono] = await Promise.all([
    readFile(path.join(fontDir, "geist-sans/Geist-Regular.ttf")).then((b) => doc.embedFont(b, { subset: true })),
    readFile(path.join(fontDir, "geist-sans/Geist-Bold.ttf")).then((b) => doc.embedFont(b, { subset: true })),
    readFile(path.join(fontDir, "geist-mono/GeistMono-Regular.ttf")).then((b) => doc.embedFont(b, { subset: true })),
  ]);
  doc.setTitle(`Angebot ${s.number}`);
  doc.setAuthor("RIDEFF");
  doc.setCreationDate(new Date(s.acceptance.at));
  doc.setModificationDate(new Date(s.acceptance.at));

  const W = 595.28, H = 841.89, X = 56, R = W - 56;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 64;
  const bg = (p: PDFPage) => p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  bg(page);
  const need = (h: number) => {
    if (y - h > 64) return;
    page = doc.addPage([W, H]);
    bg(page);
    y = H - 64;
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(t, { x, y, size, font, color });
  const right = (t: string, size: number, font: PDFFont, color = INK) =>
    text(t, R - font.widthOfTextAtSize(t, size), size, font, color);
  const rule = () => page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.75, color: LINE });
  const check = (x: number, yy: number) => {
    page.drawLine({ start: { x, y: yy + 4 }, end: { x: x + 3, y: yy + 1 }, thickness: 1.4, color: BRAND });
    page.drawLine({ start: { x: x + 3, y: yy + 1 }, end: { x: x + 8, y: yy + 8 }, thickness: 1.4, color: BRAND });
  };
  const euro = (c: number) => formatMoney(c, "de");

  text("RIDEFF", X, 15, bold);
  right(String(m.offer.docLabel).replace("{nr}", s.number), 9, mono, MUTED);
  y -= 46;
  text(String(m.offer.headline).replace("{package}", s.packageName).replace("{org}", s.orgName), X, 26, bold);
  y -= 36;
  text(String(m.offer.service), X, 8, mono, MUTED);
  right(String(m.offer.amount), 8, mono, MUTED);
  y -= 10;

  for (const key of s.groups.filter(isOfferGroup)) {
    const g = group(key);
    const points = Array.from({ length: OFFER_GROUPS[key] }, (_, i) => g[String(i + 1)]);
    need(32 + Math.ceil(points.length / 2) * 17);
    rule();
    y -= 22;
    text(g.title, X, 13, bold);
    right(m.common.included, 10, mono, MUTED);
    y -= 20;
    points.forEach((p, i) => {
      const col = i % 2 === 0 ? X : X + (R - X) / 2;
      check(col, y);
      text(p, col + 14, 10.5, regular, MUTED);
      if (i % 2 === 1 || i === points.length - 1) y -= 17;
    });
    y -= 6;
  }

  const rows: [string, string][] = [
    [String(m.offer.setupOnce), euro(s.setupCents)],
    [String(m.offer.monthlyRow).replace("{package}", s.packageName), euro(s.monthlyCents)],
    [String(m.offer.term), `${s.termMonths} Monate`],
  ];
  for (const [l, v] of rows) {
    need(30);
    rule();
    y -= 20;
    text(l, X, 11.5, regular);
    right(v, 10.5, mono);
    y -= 12;
  }
  y -= 16;
  text(m.money.netNote, X, 8, mono, MUTED);

  // acceptance record
  need(110);
  y -= 34;
  rule();
  y -= 22;
  text("FREIGABE", X, 8, mono, MUTED);
  y -= 18;
  const acc: [string, string][] = [
    ["Zeitpunkt", new Date(s.acceptance.at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })],
    ["Freigegeben von", `${s.acceptance.by} <${s.acceptance.email}>`],
    ["IP-Adresse", s.acceptance.ip],
    ["AGB-Version", s.acceptance.agbVersion],
  ];
  for (const [l, v] of acc) {
    text(l, X, 9.5, regular, MUTED);
    text(v, X + 120, 9.5, mono);
    y -= 15;
  }
  return doc.save({ useObjectStreams: false });
}
