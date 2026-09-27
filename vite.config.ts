import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { syncMetadata } from './scripts/sync-version.js';

// Vite plugin to keep all metadata synchronized with config/appinfo.ts
function syncMetadataPlugin(): Plugin {
  return {
    name: 'sync-metadata-plugin',
    buildStart() {
      try {
        syncMetadata();
      } catch (err) {
        console.warn('Could not auto-sync metadata on build start:', err);
      }
    },
    handleHotUpdate({ file }) {
      if (file.includes('appinfo.ts') || file.includes('appInfo.ts')) {
        try {
          syncMetadata();
        } catch (err) {
          console.warn('Could not auto-sync metadata on file change:', err);
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [syncMetadataPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
