/**
 * Builds favicon + PWA / home-screen icons from the official Relief emblem PNG.
 *
 * Source: public/brand/relief-chiropractic-favicon.png (square crop from the wide logo)
 * Full lockup: public/brand/relief-chiropractic-logo.png
 * Run: npm run generate:pwa-icons  (also runs before `npm run build`)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE = path.join(process.cwd(), "public", "brand", "relief-chiropractic-favicon.png");

/** Brand green — matches theme_color in manifests */
const BRAND_GREEN = { r: 22, g: 163, b: 73, alpha: 1 };

function resizeEmblem(size) {
  return sharp(SOURCE).resize(size, size, {
    fit: "cover",
    position: "centre",
    kernel: sharp.kernel.lanczos3,
  });
}

async function writeIcon(size, filename) {
  const out = path.join(process.cwd(), "public", filename);
  await resizeEmblem(size).png({ compressionLevel: 9 }).toFile(out);
  console.log("Wrote", out);
}

/** Maskable / adaptive icon: emblem centered on solid green (Android safe zone). */
async function writeMaskableIcon(size, filename) {
  const out = path.join(process.cwd(), "public", filename);
  const emblemSize = Math.round(size * 0.72);
  const emblem = await resizeEmblem(emblemSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_GREEN,
    },
  })
    .composite([{ input: emblem, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log("Wrote", out);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error("Missing source:", SOURCE);
    process.exit(1);
  }

  await writeIcon(32, "icon-32x32.png");
  await writeIcon(180, "apple-touch-icon.png");
  await writeIcon(192, "icon-192x192.png");
  await writeMaskableIcon(192, "icon-192x192-maskable.png");
  await writeIcon(512, "icon-512x512.png");
  await writeMaskableIcon(512, "icon-512x512-maskable.png");

  const appIcon = path.join(process.cwd(), "app", "icon.png");
  await sharp(SOURCE).png({ compressionLevel: 9 }).toFile(appIcon);
  console.log("Wrote", appIcon);

  const appApple = path.join(process.cwd(), "app", "apple-icon.png");
  await resizeEmblem(180).png({ compressionLevel: 9 }).toFile(appApple);
  console.log("Wrote", appApple);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
