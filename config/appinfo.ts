/**
 * =============================================================================
 * CENTRAL APPLICATION METADATA & CONFIGURATION
 * =============================================================================
 * 
 * This file is the primary, directly editable SINGLE SOURCE OF TRUTH for all
 * application metadata across the entire project.
 * 
 * Editing the values below automatically updates:
 * - Application UI (About screen, Info modal, Settings, Navigation bars)
 * - HTML Title & OpenGraph Meta tags (index.html)
 * - Electron Desktop Packaging & Installer (package.json, NSIS installer, build)
 * - AI Studio Project Manifest (metadata.json)
 */

export interface AppInfo {
  /** Application Name */
  name: string;
  /** Semantic Version Number (e.g. 3.2.0) */
  version: string;
  /** Primary Author / Maintainer */
  author: string;
  /** Official Release / Build Date */
  releaseDate: string;
  /** Initial Project Creation Date */
  created: string;
  /** Primary Description */
  description: string;
  /** Official Telegram Contact / Support Handle */
  telegramContact: string;
  /** Official Project Homepage / Download Page */
  website?: string;
  /** Source Code Repository */
  repository?: string;
  /** Project License */
  license?: string;
  /** Official Legal & Disclaimer Notice */
  disclaimer: {
    isOpenSource: boolean;
    isFree: boolean;
    isNonCommercial: boolean;
    isIndependent: boolean;
    telegramAffiliation: string;
    fullText: string;
  };
}

export const APP_INFO: AppInfo = {
  // Application Information
  name: 'Telegram Archive Viewer',
  version: '3.7.0',
  author: 'Jared Lee',
  releaseDate: 'September 2026',
  created: 'September 2026',

  // Contact & Support
  telegramContact: '@z7zz1L',

  // Project URLs
  website: 'https://github.com/z7zz1L/telegram-archive-viewer',
  repository: 'https://github.com/z7zz1L/telegram-archive-viewer',
  license: 'MIT',

  // Descriptions & Summary
  description:
    'Streamlined, high-performance single-chat Telegram archive viewer with automatic root folder import and rich media support.',

  // Legal & Project Status Disclaimer
  disclaimer: {
    isOpenSource: true,
    isFree: true,
    isNonCommercial: true,
    isIndependent: true,
    telegramAffiliation: 'Not affiliated with, endorsed by, or officially connected to Telegram.',
    fullText:
      'Telegram Archive Viewer is an independent, free, and open-source non-commercial project created by Jared Lee. It is not affiliated with, endorsed by, sponsored by, or officially connected to Telegram FZ-LLC or Telegram Messenger Inc. All Telegram trademarks and service marks belong to their respective owners.',
  },
};

export default APP_INFO;
