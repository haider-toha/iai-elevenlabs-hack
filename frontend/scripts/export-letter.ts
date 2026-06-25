import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";

// Screenshots the canonical rendered letter into print-ready files. The HTML
// preview stays the source of truth; the PDF and PNG are derived from the exact
// component you iterate on in the browser, so there's no layout drift between dev
// and the printed letter you scan on stage.
//   pnpm tsx scripts/export-letter.ts maria-p2
const id = process.argv[2];
if (!id) {
  console.error("usage: pnpm tsx scripts/export-letter.ts <letter-id>");
  process.exit(1);
}

await mkdir("out", { recursive: true });

const browser = await chromium.launch();
// A4 at 96dpi — the viewport the preview is designed against.
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

await page.goto(`http://localhost:3000/letters/${id}/preview`, {
  waitUntil: "networkidle",
});

await page.pdf({ path: `out/${id}.pdf`, format: "A4", printBackground: true });
await page.screenshot({ path: `out/${id}.png`, fullPage: true });

await browser.close();

console.log(`Wrote out/${id}.pdf and out/${id}.png`);
