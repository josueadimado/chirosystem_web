/**
 * Renders branded PWA icons (PNG) from an SVG template into public/.
 * Relief green gradient + gold accent + white logo mark (matches in-app IconLogo).
 *
 * Run: npm run generate:pwa-icons
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** SVG at 512×512; sharp resizes to 192 / 512 for crisp manifest icons */
function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="reliefBg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22c46d"/>
      <stop offset="0.45" stop-color="#16a349"/>
      <stop offset="1" stop-color="#0d5c2e"/>
    </linearGradient>
    <clipPath id="roundIcon">
      <rect width="512" height="512" rx="108" ry="108"/>
    </clipPath>
  </defs>
  <!-- Solid base so rounded-rect corners are not transparent on home screens -->
  <rect width="512" height="512" fill="#16a349"/>
  <g clip-path="url(#roundIcon)">
    <rect width="512" height="512" fill="url(#reliefBg)"/>
    <path d="M512 368 L512 512 L368 512 Q440 472 480 400 Q502 384 512 368 Z" fill="#e9982f" opacity="0.95"/>
    <ellipse cx="420" cy="120" rx="140" ry="100" fill="#ffffff" opacity="0.06"/>
  </g>
  <g transform="translate(97, 97) scale(9.9375)" fill="#ffffff" stroke="none">
    <path d="M16 6c-1.5 0-3 .5-4 1.5-2 2-2 5 0 7l4 4 4-4c2-2 2-5 0-7-1-1-2.5-1.5-4-1.5z" opacity="0.96"/>
    <path d="M8 14v4h2v-4H8zm4 2v2h2v-2h-2zm4-2v4h2v-4h-2zm4 2v2h2v-2h-2zm4-2v4h2v-4h-2z" opacity="1"/>
  </g>
</svg>`;
}

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  const svg = Buffer.from(iconSvg(), "utf8");

  for (const size of [192, 512]) {
    const out = path.join(publicDir, `icon-${size}x${size}.png`);
    await sharp(svg).resize(size, size, { fit: "fill" }).png({ compressionLevel: 9 }).toFile(out);
    console.log("Wrote", out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
