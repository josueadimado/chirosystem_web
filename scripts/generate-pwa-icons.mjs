/**
 * Generates solid-brand PNG icons for the PWA manifest (public/).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const brand = { r: 22, g: 163, b: 73 }; // #16a349

function writeIcon(size, fileName) {
  const png = new PNG({ width: size, height: size, colorType: 6, inputHasAlpha: true });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) * 4;
      png.data[i] = brand.r;
      png.data[i + 1] = brand.g;
      png.data[i + 2] = brand.b;
      png.data[i + 3] = 255;
    }
  }
  const out = path.join(process.cwd(), "public", fileName);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log("Wrote", out);
}

writeIcon(192, "icon-192x192.png");
writeIcon(512, "icon-512x512.png");
