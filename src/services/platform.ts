// Platform abstraction layer for Web / Electron / Tauri

export interface PlatformCapabilities {
  isWeb: boolean;
  isElectron: boolean;
  isTauri: boolean;
  canAccessFileSystem: boolean;
}

export const platform: PlatformCapabilities = {
  isWeb: typeof window !== 'undefined' && !('__TAURI__' in window) && !('electronAPI' in window),
  isElectron: typeof window !== 'undefined' && 'electronAPI' in window,
  isTauri: typeof window !== 'undefined' && '__TAURI__' in window,
  canAccessFileSystem:
    typeof window !== 'undefined' &&
    ('showDirectoryPicker' in window || 'electronAPI' in window || '__TAURI__' in window),
};
