// Unified Media Resolution Layer
// Maps relative export paths to local Blob URLs (web) or native paths (Electron/Tauri)

export interface MediaExportInfo {
  folderName: string;
  totalFiles: number;
  lastImported: number;
}

class MediaService {
  private mediaMap = new Map<string, { file: File; objectUrl?: string }>();
  private basenameMap = new Map<string, { file: File; objectUrl?: string }>();
  private urlCache = new Map<string, string>();
  private listeners = new Set<() => void>();
  private currentExportInfo: MediaExportInfo | null = null;
  private exportRootPath: string | null = null;

  constructor() {
    this.restoreExportInfo();
    this.initElectronRoot();
  }

  private async initElectronRoot() {
    if (typeof window !== 'undefined' && window.electronAPI?.getExportRoot) {
      try {
        const root = await window.electronAPI.getExportRoot();
        if (root && root.path) {
          const exists = await window.electronAPI.checkDirectoryExists(root.path);
          if (exists) {
            this.exportRootPath = root.path;
            if (!this.currentExportInfo) {
              this.currentExportInfo = {
                folderName: root.name || 'Telegram Export',
                totalFiles: 0,
                lastImported: Date.now(),
              };
            }
            this.notify();
          }
        }
      } catch (err) {
        console.warn('Could not initialize Electron export root:', err);
      }
    }
  }

  private restoreExportInfo() {
    try {
      const saved = localStorage.getItem('telegram_export_media_info');
      if (saved) {
        this.currentExportInfo = JSON.parse(saved);
      }
    } catch {
      // ignore
    }
  }

  private saveExportInfo(info: MediaExportInfo) {
    this.currentExportInfo = info;
    try {
      localStorage.setItem('telegram_export_media_info', JSON.stringify(info));
    } catch {
      // ignore
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  getExportInfo(): MediaExportInfo | null {
    return this.currentExportInfo;
  }

  setExportRootPath(rootPath: string, folderName?: string): void {
    this.exportRootPath = rootPath;
    const name = folderName || rootPath.split(/[/\\]/).pop() || 'Telegram Export';
    this.saveExportInfo({
      folderName: name,
      totalFiles: this.mediaMap.size,
      lastImported: Date.now(),
    });

    if (typeof window !== 'undefined' && window.electronAPI?.setExportRoot) {
      window.electronAPI.setExportRoot(rootPath, name);
    }
    this.notify();
  }

  getTotalMediaCount(): number {
    return this.mediaMap.size;
  }

  // Normalize path keys: preserves case by default, option to lowercase for fallback
  normalizePath(rawPath: string, lowercase = false): string {
    if (!rawPath) return '';
    try {
      rawPath = decodeURIComponent(rawPath);
    } catch {
      // ignore
    }
    let p = rawPath.replace(/\\/g, '/');
    p = p.replace(/^\.\//, '');
    p = p.replace(/^\//, '').trim();
    return lowercase ? p.toLowerCase() : p;
  }

  // Register all files from an export folder
  registerFiles(
    files: FileList | File[],
    folderName = 'Telegram Export'
  ): { registeredCount: number; categories: Record<string, number> } {
    // Clear old blob URLs to prevent memory leaks
    this.clearObjectUrls();

    const categories: Record<string, number> = {
      photos: 0,
      stickers: 0,
      videos: 0,
      audio: 0,
      files: 0,
      other: 0,
    };

    let count = 0;
    const fileList = Array.from(files);

    for (const file of fileList) {
      const relPath = (file as any).webkitRelativePath || file.name;
      if (!relPath) continue;

      // Extract relative subpath after the root export folder name
      // e.g. "Telegram Export/photos/photo_1.jpg" -> "photos/photo_1.jpg"
      const parts = relPath.split(/[/\\]/);
      let relativeKey = relPath;
      if (parts.length > 1) {
        relativeKey = parts.slice(1).join('/');
      }

      const exactKey = this.normalizePath(relativeKey, false);
      const exactFilenameKey = this.normalizePath(file.name, false);
      const lowerKey = exactKey.toLowerCase();
      const lowerFilenameKey = exactFilenameKey.toLowerCase();
      const entry = { file };

      // Primary index: exact case matching for case-sensitive filesystems
      this.mediaMap.set(exactKey, entry);
      this.basenameMap.set(exactFilenameKey, entry);

      // Fallback index: lowercase keys if different from exact key
      if (lowerKey !== exactKey && !this.mediaMap.has(lowerKey)) {
        this.mediaMap.set(lowerKey, entry);
      }
      if (lowerFilenameKey !== exactFilenameKey && !this.basenameMap.has(lowerFilenameKey)) {
        this.basenameMap.set(lowerFilenameKey, entry);
      }

      // Also store with sub-folder keys (e.g. if path was chats/chat_01/photos/...)
      const lastTwo = parts.slice(-2).join('/');
      if (lastTwo) {
        const exactLastTwo = this.normalizePath(lastTwo, false);
        this.mediaMap.set(exactLastTwo, entry);
        if (exactLastTwo.toLowerCase() !== exactLastTwo && !this.mediaMap.has(exactLastTwo.toLowerCase())) {
          this.mediaMap.set(exactLastTwo.toLowerCase(), entry);
        }
      }

      count++;

      // Categorize
      const lower = file.name.toLowerCase();
      if (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp')
      ) {
        if (exactKey.toLowerCase().includes('sticker')) categories.stickers++;
        else categories.photos++;
      } else if (
        lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.gif')
      ) {
        categories.videos++;
      } else if (
        lower.endsWith('.mp3') ||
        lower.endsWith('.ogg') ||
        lower.endsWith('.wav') ||
        lower.endsWith('.m4a') ||
        lower.endsWith('.opus')
      ) {
        categories.audio++;
      } else if (
        !lower.endsWith('.html') &&
        !lower.endsWith('.htm') &&
        !lower.endsWith('.json') &&
        !lower.endsWith('.css') &&
        !lower.endsWith('.js')
      ) {
        categories.files++;
      }
    }

    this.saveExportInfo({
      folderName,
      totalFiles: count,
      lastImported: Date.now(),
    });

    this.notify();
    return { registeredCount: count, categories };
  }

  // Unified single API: Resolve relative media URL
  resolveMediaUrl(rawUrl?: string): string | undefined {
    if (!rawUrl) return undefined;

    // If it's already an http(s), data, blob, or custom scheme URL, return as is
    if (
      rawUrl.startsWith('http://') ||
      rawUrl.startsWith('https://') ||
      rawUrl.startsWith('blob:') ||
      rawUrl.startsWith('data:') ||
      rawUrl.startsWith('tg-media://')
    ) {
      return rawUrl;
    }

    const exactNormKey = this.normalizePath(rawUrl, false);
    const lowerNormKey = exactNormKey.toLowerCase();

    // In Electron with a persistent exportRootPath, serve directly via tg-media:// protocol
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron && this.exportRootPath) {
      return `tg-media://file/${encodeURI(exactNormKey)}`;
    }

    // Check cached Object URL for browser sessions
    if (this.urlCache.has(exactNormKey)) {
      return this.urlCache.get(exactNormKey);
    }
    if (this.urlCache.has(lowerNormKey)) {
      return this.urlCache.get(lowerNormKey);
    }

    // Lookup in mediaMap (exact relative path first, then lowercased)
    let entry = this.mediaMap.get(exactNormKey) || this.mediaMap.get(lowerNormKey);
    if (!entry) {
      // Fallback 1: filename only from O(1) secondary index (exact, then lowercased)
      const fileName = exactNormKey.split('/').pop() || '';
      entry = this.basenameMap.get(fileName) || this.basenameMap.get(fileName.toLowerCase());
    }
    if (!entry) {
      // Fallback 2: check last two path segments
      const parts = exactNormKey.split('/');
      if (parts.length > 1) {
        const lastTwo = parts.slice(-2).join('/');
        entry = this.mediaMap.get(lastTwo) || this.mediaMap.get(lastTwo.toLowerCase());
      }
    }

    if (entry && entry.file) {
      try {
        const objUrl = URL.createObjectURL(entry.file);
        entry.objectUrl = objUrl;
        this.urlCache.set(exactNormKey, objUrl);
        return objUrl;
      } catch (err) {
        console.warn('Failed to create Object URL for:', exactNormKey, err);
      }
    }

    // If in Electron but export root was not yet set, still return tg-media protocol format
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      return `tg-media://file/${encodeURI(exactNormKey)}`;
    }

    return rawUrl;
  }

  // Backward compatibility alias
  resolveUrl(rawUrl?: string): string | undefined {
    return this.resolveMediaUrl(rawUrl);
  }

  private clearObjectUrls(): void {
    for (const [, url] of this.urlCache) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.urlCache.clear();
  }

  // Rebuild media index URL caches
  rebuildMediaIndex(): number {
    this.clearObjectUrls();
    this.notify();
    return this.mediaMap.size;
  }

  // Clear all cached object URLs and files
  clear(): void {
    this.clearObjectUrls();
    this.mediaMap.clear();
    this.basenameMap.clear();
    this.notify();
  }

  isMediaDirectoryActive(): boolean {
    return this.mediaMap.size > 0 || !!this.exportRootPath;
  }

  // Completely reset all media state, export roots, and persisted local storage
  resetAll(): void {
    this.clear();
    this.currentExportInfo = null;
    this.exportRootPath = null;
    try {
      localStorage.removeItem('telegram_export_media_info');
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined' && window.electronAPI?.setExportRoot) {
      window.electronAPI.setExportRoot('', '');
    }
    this.notify();
  }
}

export const mediaService = new MediaService();
export const resolveMediaUrl = (url?: string) => mediaService.resolveMediaUrl(url);
