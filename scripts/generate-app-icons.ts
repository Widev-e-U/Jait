import sharp from 'sharp';
import { readFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'e:/Jait';
const SVG_APP = readFileSync(join(ROOT, 'packages/shared/assets/logo/icon-app.svg'));

async function generate(svgBuffer: Buffer, outputPath: string, size: number) {
  await sharp(svgBuffer).resize(size, size).png().toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size})`);
}

async function main() {
  console.log('=== Generating white-background app icons ===\n');

  // 1. Source logo PNGs (replace the transparent-bg ones)
  const logoDir = join(ROOT, 'packages/shared/assets/logo');
  for (const size of [1024, 256, 64, 32, 16]) {
    await generate(SVG_APP, join(logoDir, `icon-${size}.png`), size);
  }

  // 2. Web favicons
  const webPublic = join(ROOT, 'apps/web/public');
  await generate(SVG_APP, join(webPublic, 'apple-touch-icon.png'), 180);
  await generate(SVG_APP, join(webPublic, 'favicon-32x32.png'), 32);
  await generate(SVG_APP, join(webPublic, 'favicon-16x16.png'), 16);
  // Keep the theme-adaptive SVG for web (currentColor version)
  // Already updated icon.svg with currentColor - copy it
  copyFileSync(
    join(ROOT, 'packages/shared/assets/logo/icon.svg'),
    join(webPublic, 'icon.svg')
  );
  console.log('  ✓ apps/web/public/icon.svg (theme-adaptive, currentColor)');

  // 3. Desktop
  const desktopAssets = join(ROOT, 'apps/desktop/assets');
  await generate(SVG_APP, join(desktopAssets, 'icon-1024.png'), 1024);
  await generate(SVG_APP, join(desktopAssets, 'icon.png'), 256);
  await generate(SVG_APP, join(desktopAssets, 'tray-icon.png'), 16);
  copyFileSync(
    join(ROOT, 'packages/shared/assets/logo/icon-app.svg'),
    join(desktopAssets, 'icon.svg')
  );
  console.log('  ✓ apps/desktop/assets/icon.svg (white bg)');

  // 4. Mobile
  const mobileAssets = join(ROOT, 'apps/mobile/assets');
  await generate(SVG_APP, join(mobileAssets, 'icon.png'), 1024);
  await generate(SVG_APP, join(mobileAssets, 'adaptive-icon.png'), 1024);
  await generate(SVG_APP, join(mobileAssets, 'splash.png'), 1024);

  // 5. Android mipmap icons
  const androidRes = join(ROOT, 'apps/mobile/android/app/src/main/res');
  const densities: [string, number][] = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ];

  for (const [density, size] of densities) {
    const dir = join(androidRes, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    await generate(SVG_APP, join(dir, 'ic_launcher.png'), size);
    await generate(SVG_APP, join(dir, 'ic_launcher_round.png'), size);
    await generate(SVG_APP, join(dir, 'ic_launcher_foreground.png'), size);
  }

  // 6. Android splash screens
  const splashSizes: [string, number, number][] = [
    ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600],
    ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320],
    ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960],
    ['drawable-land-xxxhdpi', 1920, 1280],
  ];

  for (const [folder, w, h] of splashSizes) {
    const dir = join(androidRes, folder);
    mkdirSync(dir, { recursive: true });
    const iconSize = Math.min(w, h) * 0.4;
    await sharp(SVG_APP)
      .resize(Math.round(iconSize), Math.round(iconSize))
      .extend({
        top: Math.round((h - iconSize) / 2),
        bottom: Math.round((h - iconSize) / 2),
        left: Math.round((w - iconSize) / 2),
        right: Math.round((w - iconSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .resize(w, h)
      .png()
      .toFile(join(dir, 'splash.png'));
    console.log(`  ✓ ${folder}/splash.png (${w}x${h})`);
  }

  console.log('\n=== Done! ===');
}

main().catch(console.error);
