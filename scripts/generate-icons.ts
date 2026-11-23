/**
 * Gera os ícones PNG do app instalado (PWA / tela inicial / favicon) com a marca do app
 * (/public/brand/mark.svg: branca, com transparência) sobre fundo tinta. Requer sharp.
 * Rode após mudar a marca: npm run icons
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const INK = "#1b1a18";
const logo = "public/brand/mark.svg";

/** Quadrado cheio em tinta com o logo centralizado. `scale` = largura do logo / lado. */
async function icon(size: number, scale: number, file: string) {
  const w = Math.round(size * scale);
  const d = await sharp(logo).resize({ width: w }).toBuffer();
  const meta = await sharp(d).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: d, left: Math.round((size - w) / 2), top: Math.round((size - (meta.height ?? 0)) / 2) }])
    .png()
    .toFile(file);
  console.log("\u2714", file);
}

mkdirSync("public/icons", { recursive: true });
// Ícones iOS não podem ter transparência: fundo cheio, o iOS arredonda sozinho.
await icon(192, 0.86, "public/icons/icon-192.png");
await icon(512, 0.86, "public/icons/icon-512.png");
// Maskable: o logo fica dentro da zona segura (80% central), pois o Android recorta em círculo.
await icon(512, 0.66, "public/icons/icon-maskable-512.png");
await icon(180, 0.86, "src/app/apple-icon.png");
await icon(64, 0.94, "src/app/icon.png"); // favicon
