const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

// Register custom protocol scheme privileges before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tg-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const p = getSettingsFilePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (err) {
    console.warn('Error reading settings:', err);
  }
  return {};
}

function saveSettings(settings) {
  try {
    const p = getSettingsFilePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

function getStoredExportRoot() {
  const s = loadSettings();
  return s.exportRootPath || null;
}

function isPathInside(targetPath, rootPath) {
  if (!targetPath || !rootPath) return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
}

function isInsideExportRoot(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const exportRoot = getStoredExportRoot();
  if (!exportRoot) return false;
  return isPathInside(targetPath, exportRoot);
}

function resolveAbsoluteMediaPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const exportRoot = getStoredExportRoot();
  if (!exportRoot) return null;

  const resolvedRoot = path.resolve(exportRoot);

  let cleanRel = relativePath
    .replace(/^tg-media:\/\/file[/\\]?/, '')
    .replace(/^tg-media:\/\//, '')
    .replace(/^file[/\\]?/, '')
    .replace(/^[/\\]+/, '');
  try {
    cleanRel = decodeURIComponent(cleanRel);
  } catch {}

  let targetPath = path.resolve(resolvedRoot, cleanRel);
  if (isPathInside(targetPath, resolvedRoot) && fs.existsSync(targetPath)) {
    return targetPath;
  }

  // Fallback: search in common export subfolders if needed
  const base = path.basename(cleanRel);
  const candidates = [
    path.join(resolvedRoot, base),
    path.join(resolvedRoot, 'photos', base),
    path.join(resolvedRoot, 'stickers', base),
    path.join(resolvedRoot, 'video_files', base),
    path.join(resolvedRoot, 'voice_messages', base),
    path.join(resolvedRoot, 'round_video_messages', base),
    path.join(resolvedRoot, 'files', base),
  ];

  for (const candidate of candidates) {
    const resolvedCandidate = path.resolve(candidate);
    if (isPathInside(resolvedCandidate, resolvedRoot) && fs.existsSync(resolvedCandidate)) {
      return resolvedCandidate;
    }
  }

  return null;
}

async function scanDirectoryRecursive(dirPath, rootPath = dirPath) {
  let results = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const subPromises = entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return await scanDirectoryRecursive(fullPath, rootPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
        const stats = await fs.promises.stat(fullPath);
        return [{
          name: entry.name,
          fullPath,
          relativePath,
          size: stats.size,
        }];
      }
      return [];
    });
    const subResults = await Promise.all(subPromises);
    results = subResults.flat();
  } catch (err) {
    console.error('Error scanning directory:', err);
  }
  return results;
}

function createWindow() {
  const icoPath = path.join(__dirname, '../build/icon.ico');
  const windowIcon = fs.existsSync(icoPath) ? icoPath : undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0e1621',
    title: app.name || 'Telegram Archive Viewer',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  const isDev = !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';

  if (isDev) {
    mainWindow.loadURL(devServerUrl).catch((err) => {
      console.error('Failed to load Vite dev server:', err);
    });

    // Optional: automatically open DevTools during development
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('dialog:selectExportDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Telegram Export Folder',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const folderName = path.basename(selectedPath);

  // Automatically save export root to persistent settings
  const s = loadSettings();
  s.exportRootPath = selectedPath;
  s.exportRootName = folderName;
  saveSettings(s);

  return {
    path: selectedPath,
    name: folderName,
  };
});

ipcMain.handle('fs:readDirectoryFiles', async (_event, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') return [];
  if (!isInsideExportRoot(dirPath)) {
    console.warn(`Denied readDirectoryFiles access outside export root: ${dirPath}`);
    throw new Error('Access denied: requested path is outside the export root.');
  }
  return await scanDirectoryRecursive(dirPath, dirPath);
});

ipcMain.handle('fs:readFileAsText', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return '';
  if (!isInsideExportRoot(filePath)) {
    console.warn(`Denied readFileAsText access outside export root: ${filePath}`);
    throw new Error('Access denied: requested path is outside the export root.');
  }
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file text for ${filePath}:`, err);
    throw err;
  }
});

ipcMain.handle('fs:readMultipleFilesAsText', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return {};
  const CONCURRENCY = 8;
  const results = {};
  const validPaths = filePaths.filter((fp) => isInsideExportRoot(fp));
  for (let i = 0; i < validPaths.length; i += CONCURRENCY) {
    const slice = validPaths.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (fp) => {
        try {
          results[fp] = await fs.promises.readFile(fp, 'utf-8');
        } catch (err) {
          console.warn(`Error reading file text for ${fp}:`, err);
          results[fp] = '';
        }
      })
    );
  }
  return results;
});

ipcMain.handle('fs:readFileAsBlobUrl', async (_event, filePath, mimeType = 'application/octet-stream') => {
  if (!filePath || typeof filePath !== 'string') return null;
  if (!isInsideExportRoot(filePath)) {
    console.warn(`Denied readFileAsBlobUrl access outside export root: ${filePath}`);
    return null;
  }
  try {
    const buffer = await fs.promises.readFile(filePath);
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error(`Error reading binary file for ${filePath}:`, err);
    return null;
  }
});

ipcMain.handle('fs:getExportFolderInfo', async (_event, dirPath) => {
  if (!dirPath || !isInsideExportRoot(dirPath)) return null;
  try {
    const files = await scanDirectoryRecursive(dirPath, dirPath);
    return {
      path: dirPath,
      name: path.basename(dirPath),
      totalFiles: files.length,
      files,
    };
  } catch (err) {
    console.error('Error fetching export folder info:', err);
    return null;
  }
});

ipcMain.handle('fs:checkDirectoryExists', async (_event, dirPath) => {
  if (!dirPath || !isInsideExportRoot(dirPath)) return false;
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
});

ipcMain.handle('app:getSetting', async (_event, key) => {
  const s = loadSettings();
  return s[key];
});

ipcMain.handle('app:setSetting', async (_event, key, val) => {
  const s = loadSettings();
  s[key] = val;
  saveSettings(s);
  return true;
});

ipcMain.handle('app:getExportRoot', async () => {
  const s = loadSettings();
  return {
    path: s.exportRootPath || null,
    name: s.exportRootName || null,
  };
});

ipcMain.handle('app:setExportRoot', async (_event, rootPath, rootName) => {
  const s = loadSettings();
  s.exportRootPath = rootPath;
  if (rootName) s.exportRootName = rootName;
  saveSettings(s);
  return true;
});

ipcMain.handle('fs:openInSystemApp', async (_event, relativePath) => {
  const absPath = resolveAbsoluteMediaPath(relativePath);
  if (!absPath) {
    throw new Error('File not found on disk or export root not set');
  }
  const result = await shell.openPath(absPath);
  if (result) {
    throw new Error(result);
  }
  return true;
});

ipcMain.handle('app:closeApp', async () => {
  if (mainWindow) {
    mainWindow.destroy();
  }
  return true;
});

// Single Instance Protection
const gotTheSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotTheSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    // Focus existing window when second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Register tg-media protocol handler for offline streaming of media files
    protocol.handle('tg-media', (request) => {
      try {
        const parsedUrl = new URL(request.url);
        let relativePath = decodeURIComponent(
          parsedUrl.hostname ? path.join(parsedUrl.hostname, parsedUrl.pathname) : parsedUrl.pathname
        );
        const targetPath = resolveAbsoluteMediaPath(relativePath);
        if (!targetPath) {
          return new Response('Media file not found at path', { status: 404 });
        }
        return net.fetch(pathToFileURL(targetPath).toString());
      } catch (err) {
        console.error('Error handling tg-media request:', err);
        return new Response('Internal error serving tg-media', { status: 500 });
      }
    });

  createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

module.exports = {
  createWindow,
};
