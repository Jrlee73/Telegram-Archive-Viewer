import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/**
 * Creates an uncompressed 24-bit BMP Buffer.
 * @param {number} width 
 * @param {number} height 
 * @param {function(x: number, y: number): {r: number, g: number, b: number}} getPixel 
 * @returns {Buffer}
 */
function createBMPBuffer(width, height, getPixel) {
  const rowPadding = (4 - ((width * 3) % 4)) % 4;
  const rowSize = width * 3 + rowPadding;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);

  // 1. File Header (14 bytes)
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt32LE(54, 10);

  // 2. DIB Header (BITMAPINFOHEADER - 40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // Bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // 3. Pixel Data
  for (let y = 0; y < height; y++) {
    const topDownY = height - 1 - y;
    const rowOffset = 54 + y * rowSize;

    for (let x = 0; x < width; x++) {
      const { r, g, b } = getPixel(x, topDownY);
      const pixelOffset = rowOffset + x * 3;
      buf.writeUInt8(Math.max(0, Math.min(255, b)), pixelOffset);
      buf.writeUInt8(Math.max(0, Math.min(255, g)), pixelOffset + 1);
      buf.writeUInt8(Math.max(0, Math.min(255, r)), pixelOffset + 2);
    }
  }

  return buf;
}

/**
 * Generates installer wizard header graphic (150 x 57 px BMP)
 * Dark theme matching Telegram Archive Viewer UI (#0f172a to #1e293b gradient with cyan accent)
 */
function generateInstallerHeader() {
  const width = 150;
  const height = 57;

  const buffer = createBMPBuffer(width, height, (x, y) => {
    // Top border cyan accent
    if (y < 2) {
      return { r: 56, g: 189, b: 248 }; // #38bdf8 cyan
    }
    // Bottom border subtle slate
    if (y >= height - 2) {
      return { r: 51, g: 65, b: 85 }; // #334155
    }
    // Left accent bar
    if (x < 5 && y >= 8 && y <= height - 8) {
      return { r: 2, g: 132, b: 199 }; // #0284c7 blue
    }

    // Horizontal dark gradient (#0f172a to #1e293b)
    const factor = x / width;
    const r = Math.round(15 + factor * 15);
    const g = Math.round(23 + factor * 18);
    const b = Math.round(42 + factor * 17);

    return { r, g, b };
  });

  fs.writeFileSync(path.join(BUILD_DIR, 'installerHeader.bmp'), buffer);
  console.log('  • Generated "build/installerHeader.bmp" (150x57)');
}

/**
 * Generates installer sidebar graphic for Welcome/Finish pages (164 x 314 px BMP)
 * Deep slate gradient with blue accent vertical bar and Telegram emblem geometry
 */
function generateInstallerSidebar() {
  const width = 164;
  const height = 314;

  const buffer = createBMPBuffer(width, height, (x, y) => {
    // Left vertical brand accent stripe (5px wide)
    if (x < 5) {
      // Gradient from cyan (#38bdf8) to blue (#0284c7)
      const ratio = y / height;
      const r = Math.round(56 * (1 - ratio) + 2 * ratio);
      const g = Math.round(189 * (1 - ratio) + 132 * ratio);
      const b = Math.round(248 * (1 - ratio) + 199 * ratio);
      return { r, g, b };
    }

    // Vertical dark slate background gradient (#0b0f19 at top to #1e293b at bottom)
    const t = y / height;
    let r = Math.round(11 + t * 19);
    let g = Math.round(15 + t * 26);
    let b = Math.round(25 + t * 34);

    // Subtle horizontal divider line
    if (y === 240) {
      return { r: 51, g: 65, b: 85 };
    }

    // Stylized paper plane / badge emblem geometry around center (x: 82, y: 110)
    const cx = 82;
    const cy = 110;
    const dx = x - cx;
    const dy = y - cy;
    const distSq = dx * dx + dy * dy;

    // Glowing outer ring
    if (distSq >= 34 * 34 && distSq <= 38 * 38) {
      return { r: 2, g: 132, b: 199 }; // #0284c7
    }
    // Inner emblem fill
    if (distSq < 34 * 34) {
      // Paper plane polygon simulation:
      // Main wing triangle: top right to bottom left
      const inWing = (dx + dy * 0.6 >= -10) && (dx - dy * 0.8 <= 15) && (dy >= -15 && dy <= 15);
      if (inWing) {
        return { r: 255, g: 255, b: 255 }; // White plane
      }
      // Blue circle backdrop
      return { r: 14, g: 116, b: 144 }; // #0e7490 cyan-blue
    }

    return { r, g, b };
  });

  fs.writeFileSync(path.join(BUILD_DIR, 'installerSidebar.bmp'), buffer);
  console.log('  • Generated "build/installerSidebar.bmp" (164x314)');
}

/**
 * Generates uninstaller sidebar graphic (164 x 314 px BMP)
 * Dark slate theme with subtle warning/slate accent
 */
function generateUninstallerSidebar() {
  const width = 164;
  const height = 314;

  const buffer = createBMPBuffer(width, height, (x, y) => {
    // Left vertical slate/rose accent stripe (5px wide)
    if (x < 5) {
      const ratio = y / height;
      const r = Math.round(100 * (1 - ratio) + 225 * ratio);
      const g = Math.round(116 * (1 - ratio) + 29 * ratio);
      const b = Math.round(139 * (1 - ratio) + 72 * ratio);
      return { r, g, b };
    }

    // Dark slate background (#0f172a to #111827)
    const t = y / height;
    const r = Math.round(15 + t * 2);
    const g = Math.round(23 + t * 1);
    const b = Math.round(42 - t * 3);

    return { r, g, b };
  });

  fs.writeFileSync(path.join(BUILD_DIR, 'uninstallerSidebar.bmp'), buffer);
  console.log('  • Generated "build/uninstallerSidebar.bmp" (164x314)');
}

function prepareAssets() {
  console.log('🎨 [Prepare Assets] Synchronizing application icon & installer assets...');

  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const buildIcoPath = path.join(BUILD_DIR, 'icon.ico');
  const publicFaviconPath = path.join(PUBLIC_DIR, 'favicon.ico');

  // Single source of truth: build/icon.ico
  if (fs.existsSync(buildIcoPath)) {
    console.log('  ✓ Single source of truth icon found at "build/icon.ico"');
    try {
      fs.copyFileSync(buildIcoPath, publicFaviconPath);
      console.log('  • Synced "build/icon.ico" to "public/favicon.ico" for browser view');
    } catch (err) {
      console.warn('  ⚠️ Note: Could not sync favicon:', err.message);
    }
  } else if (fs.existsSync(publicFaviconPath)) {
    try {
      fs.copyFileSync(publicFaviconPath, buildIcoPath);
      console.log('  • Bootstrapped single source of truth at "build/icon.ico" from "public/favicon.ico"');
    } catch (err) {
      console.warn('  ⚠️ Note: Could not copy icon to build directory:', err.message);
    }
  } else {
    console.warn('  ⚠️ NOTICE: "build/icon.ico" is not present.');
    console.warn('     Place your official Windows .ico file at: build/icon.ico');
  }

  // Check welcome logo status
  const publicLogoPath = path.join(PUBLIC_DIR, 'logo.png');
  if (fs.existsSync(publicLogoPath)) {
    console.log('  ✓ Welcome screen logo found at "public/logo.png"');
  } else {
    console.log('  ℹ️ "public/logo.png" is optional. Place your logo image at "public/logo.png" to display it on the welcome screen.');
  }

  // Generate customized NSIS installer graphics
  try {
    generateInstallerHeader();
    generateInstallerSidebar();
    generateUninstallerSidebar();
  } catch (err) {
    console.warn('  ⚠️ Note: Could not generate installer graphics:', err.message);
  }

  console.log('✅ [Prepare Assets] Asset synchronization complete!');
}

prepareAssets();
