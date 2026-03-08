/**
 * Generate Android mipmap launcher icons from the 1024px source icon.
 * Usage: bun scripts/generate-android-icons.ts
 */
import sharp from "sharp";
import { mkdirSync, copyFileSync } from "fs";
import { join } from "path";

const SOURCE = join(__dirname, "..", "packages", "shared", "assets", "logo", "icon-1024.png");
const RES_DIR = join(__dirname, "..", "apps", "mobile", "android", "app", "src", "main", "res");

// Android mipmap density → pixel size mapping
const DENSITIES: Record<string, number> = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

// Also generate splash images for each drawable density
const SPLASH_DENSITIES: Record<string, { w: number; h: number }> = {
  "drawable": { w: 480, h: 480 },
  "drawable-port-mdpi": { w: 320, h: 480 },
  "drawable-port-hdpi": { w: 480, h: 800 },
  "drawable-port-xhdpi": { w: 720, h: 1280 },
  "drawable-port-xxhdpi": { w: 960, h: 1600 },
  "drawable-port-xxxhdpi": { w: 1280, h: 1920 },
  "drawable-land-mdpi": { w: 480, h: 320 },
  "drawable-land-hdpi": { w: 800, h: 480 },
  "drawable-land-xhdpi": { w: 1280, h: 720 },
  "drawable-land-xxhdpi": { w: 1600, h: 960 },
  "drawable-land-xxxhdpi": { w: 1920, h: 1280 },
};

async function main() {
  const img = sharp(SOURCE);

  // Generate launcher icons
  for (const [dir, size] of Object.entries(DENSITIES)) {
    const outDir = join(RES_DIR, dir);
    mkdirSync(outDir, { recursive: true });

    // Standard launcher icon
    await img.clone().resize(size, size).png().toFile(join(outDir, "ic_launcher.png"));
    // Round launcher icon
    await img.clone().resize(size, size).png().toFile(join(outDir, "ic_launcher_round.png"));
    // Foreground (for adaptive icon) — use same icon, Android crops it
    await img.clone().resize(size, size).png().toFile(join(outDir, "ic_launcher_foreground.png"));

    console.log(`  ${dir}: ${size}x${size}px`);
  }

  // Generate splash screens (centered icon on dark background)
  for (const [dir, dims] of Object.entries(SPLASH_DENSITIES)) {
    const outDir = join(RES_DIR, dir);
    mkdirSync(outDir, { recursive: true });

    const iconSize = Math.min(dims.w, dims.h) * 0.4; // icon at 40% of smallest dimension
    const resizedIcon = await img.clone().resize(Math.round(iconSize), Math.round(iconSize)).png().toBuffer();

    await sharp({
      create: {
        width: dims.w,
        height: dims.h,
        channels: 4,
        background: { r: 9, g: 9, b: 11, alpha: 1 }, // #09090b
      },
    })
      .composite([{ input: resizedIcon, gravity: "centre" }])
      .png()
      .toFile(join(outDir, "splash.png"));

    console.log(`  ${dir}: ${dims.w}x${dims.h}px splash`);
  }

  console.log("\nDone! Android icons generated.");
}

main().catch(console.error);
