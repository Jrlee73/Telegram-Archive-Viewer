import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_INFO_PATH = fs.existsSync(path.join(ROOT_DIR, 'config', 'appinfo.ts'))
  ? path.join(ROOT_DIR, 'config', 'appinfo.ts')
  : path.join(ROOT_DIR, 'src', 'config', 'appinfo.ts');

const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const METADATA_JSON_PATH = path.join(ROOT_DIR, 'metadata.json');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');

export function syncMetadata() {
  console.log('🔄 [Sync Metadata] Synchronizing application metadata from central source of truth...');

  if (!fs.existsSync(APP_INFO_PATH)) {
    console.error(`❌ Could not find ${APP_INFO_PATH}`);
    return false;
  }

  const appInfoContent = fs.readFileSync(APP_INFO_PATH, 'utf-8');

  // Extract fields using robust regex matching
  const nameMatch = appInfoContent.match(/name:\s*['"]([^'"]+)['"]/);
  const versionMatch = appInfoContent.match(/version:\s*['"]([^'"]+)['"]/);
  const authorMatch = appInfoContent.match(/author:\s*['"]([^'"]+)['"]/);
  const descMatch = appInfoContent.match(/description:\s*['"]([^'"]+)['"]/);

  if (!versionMatch) {
    console.error('❌ Could not parse version from appinfo.ts');
    return false;
  }

  const rawVersion = versionMatch[1].trim(); // e.g. "2.31.0" or "v2.31"
  const appName = nameMatch ? nameMatch[1].trim() : 'Telegram Archive Viewer';
  const appAuthor = authorMatch ? authorMatch[1].trim() : 'Jared Lee';
  const appDesc = descMatch
    ? descMatch[1].trim()
    : 'Streamlined, high-performance single-chat Telegram archive viewer with automatic root folder import and rich media support.';

  // Format semver version for package.json
  let semverVersion = rawVersion.replace(/^v/i, '');
  const versionParts = semverVersion.split('.');
  if (versionParts.length === 1) {
    semverVersion = `${versionParts[0]}.0.0`;
  } else if (versionParts.length === 2) {
    semverVersion = `${versionParts[0]}.${versionParts[1]}.0`;
  }

  // 1. Sync package.json
  if (fs.existsSync(PACKAGE_JSON_PATH)) {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    let isPkgChanged = false;

    if (pkg.version !== semverVersion) {
      console.log(`  • package.json version: "${pkg.version}" ➔ "${semverVersion}"`);
      pkg.version = semverVersion;
      isPkgChanged = true;
    }

    if (pkg.author !== appAuthor) {
      console.log(`  • package.json author: "${pkg.author}" ➔ "${appAuthor}"`);
      pkg.author = appAuthor;
      isPkgChanged = true;
    }

    if (!pkg.build) pkg.build = {};
    if (pkg.build.productName !== appName) {
      console.log(`  • electron-builder productName: "${pkg.build.productName}" ➔ "${appName}"`);
      pkg.build.productName = appName;
      isPkgChanged = true;
    }

    if (!pkg.build.nsis) pkg.build.nsis = {};
    if (pkg.build.nsis.shortcutName !== appName) {
      pkg.build.nsis.shortcutName = appName;
      isPkgChanged = true;
    }

    const expectedUninstallName = `${appName} \${version}`;
    if (pkg.build.nsis.uninstallDisplayName !== expectedUninstallName) {
      pkg.build.nsis.uninstallDisplayName = expectedUninstallName;
      isPkgChanged = true;
    }

    if (isPkgChanged) {
      fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      console.log('  ✓ package.json synchronized');
    }
  }

  // 2. Sync metadata.json
  if (fs.existsSync(METADATA_JSON_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(METADATA_JSON_PATH, 'utf-8'));
      let isMetaChanged = false;

      if (meta.name !== appName) {
        console.log(`  • metadata.json name: "${meta.name}" ➔ "${appName}"`);
        meta.name = appName;
        isMetaChanged = true;
      }

      if (meta.description !== appDesc) {
        console.log(`  • metadata.json description: updated`);
        meta.description = appDesc;
        isMetaChanged = true;
      }

      if (isMetaChanged) {
        fs.writeFileSync(METADATA_JSON_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
        console.log('  ✓ metadata.json synchronized');
      }
    } catch (e) {
      console.warn('  ⚠️ Could not update metadata.json:', e.message);
    }
  }

  // 3. Sync index.html
  if (fs.existsSync(INDEX_HTML_PATH)) {
    try {
      let html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
      let isHtmlChanged = false;

      // Update <title>
      const newTitle = `<title>${appName}</title>`;
      if (!html.includes(newTitle)) {
        html = html.replace(/<title>[^<]*<\/title>/i, newTitle);
        isHtmlChanged = true;
      }

      // Update meta description
      const descTagRegex = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i;
      const newDescTag = `<meta name="description" content="${appDesc}" />`;
      if (descTagRegex.test(html)) {
        html = html.replace(descTagRegex, newDescTag);
        isHtmlChanged = true;
      }

      // Update og:title
      const ogTitleRegex = /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i;
      const newOgTitle = `<meta property="og:title" content="${appName}" />`;
      if (ogTitleRegex.test(html)) {
        html = html.replace(ogTitleRegex, newOgTitle);
        isHtmlChanged = true;
      }

      // Update og:description
      const ogDescRegex = /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i;
      const newOgDesc = `<meta property="og:description" content="${appDesc}" />`;
      if (ogDescRegex.test(html)) {
        html = html.replace(ogDescRegex, newOgDesc);
        isHtmlChanged = true;
      }

      if (isHtmlChanged) {
        fs.writeFileSync(INDEX_HTML_PATH, html, 'utf-8');
        console.log('  ✓ index.html synchronized');
      }
    } catch (e) {
      console.warn('  ⚠️ Could not update index.html:', e.message);
    }
  }

  console.log('✅ [Sync Metadata] All targets synchronized with config/appinfo.ts!');
  return true;
}

// Execute when invoked directly
syncMetadata();
