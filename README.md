# Telegram Archive Viewer

A fast, offline, privacy-focused desktop app for browsing exported Telegram chat archives — built with Electron, React, TypeScript, and SQLite (via sql.js).

Telegram's own "Export chat history" feature dumps a chat into a pile of HTML files, folders full of photos, and separate media files that are painful to browse. Telegram Archive Viewer turns that export into something that actually feels like Telegram: a searchable, scrollable, media-rich chat window — entirely on your machine, with no upload, no server, no account.

> Not affiliated with, endorsed by, or officially connected to Telegram FZ-LLC or Telegram Messenger Inc. All Telegram trademarks belong to their respective owners.

## Features

- Virtualized message list — smooth scrolling through chats with tens of thousands of messages, powered by @tanstack/react-virtual
- Full-text search — instant search across messages, senders, and dates, with jump-to-message and date navigation<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 10_00_51 PM" src="https://github.com/user-attachments/assets/e043423f-eb68-487c-ab20-cad5d534922a" />




- Rich media support —
- photos, videos, voice messages, and animated stickers (real TGS/Lottie playback, not a placeholder)<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 9_59_01 PM" src="https://github.com/user-attachments/assets/224ca46e-8fbc-478e-a300-faeddbdb90a7" />

- Media gallery —
- browse all photos/videos in a chat in one place
  <img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 10_00_15 PM" src="https://github.com/user-attachments/assets/cd6ec1b1-1217-437b-8d19-60715843b7f2" />

- Offline & local-first —
- runs on sql.js (SQLite compiled to WebAssembly) with local persistence; nothing leaves your machine
- Optional PIN lock —
-  lock the app behind a PIN
-  (salted hash, not stored in plaintext)
-   with an auto-lock/auto-wipe timer for shared or unattended machines
  <img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 10_00_03 PM" src="https://github.com/user-attachments/assets/ab41b58c-f4ff-4245-9ecf-801778fdd443" />

-Theme-
- Light/dark themes and adjustable message font size
<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 9_59_16 PM" src="https://github.com/user-attachments/assets/43fbdad3-0446-47ba-abd0-2189e262554a" />

-dashboard-
-Overview dashboard
-performance
<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 9_59_08 PM" src="https://github.com/user-attachments/assets/9677f48c-08f5-4bb3-bd56-1d3675430d78" />

-Customize-
-Highly customizable interface
-diffrent color to choose
-Text Size
<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 9_59_48 PM" src="https://github.com/user-attachments/assets/b1e599e7-5404-4a47-812f-54c98e13b2d7" />

-Prespective-
-Different viewing modes
-He/she or Pov or Oberver

<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 9_59_36 PM" src="https://github.com/user-attachments/assets/8bbd4917-0eb6-4e45-a38c-a9aee4f2c50f" />





## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm

### Install

cd telegram-archive-viewer
npm install
### Run in development

Web (browser) mode:

npm run dev
Electron desktop shell, in development:

npm run electron:dev
### Build a Windows installer

npm run electron:build
Produces an NSIS installer and a portable .exe in the release/ directory.

## Importing your Telegram export

1. In Telegram Desktop, go to Settings → Advanced → Export Telegram data, choose a single chat, and export as HTML.
2. In Telegram Archive Viewer,click Import and select the export folder (the one containing messages.html, photos/, stickers/, etc.).
<img width="1920" height="1080" alt="Telegram Archive Viewer 25_9_2026 10_07_53 PM" src="https://github.com/user-attachments/assets/022ceb8d-d697-4afe-abd9-6d9e4c00a471" />

3. The app parses the HTML export into a local SQLite database and indexes it for search.

Currently supports single-chat HTML exports produced by Telegram Desktop.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| Desktop shell | Electron |
| Database | SQLite via sql.js (WASM), persisted to IndexedDB |
| List virtualization | @tanstack/react-virtual |
| Stickers | lottie-web + pako (real TGS decoding/playback) |
| Build | Vite + electron-builder |

## Privacy & security notes

- All data stays local — there is no backend, no telemetry, no network calls.
- The optional PIN lock gates *access to the UI*; it is not full-disk or database encryption. Treat it as a screen lock, not a vault.
- Electron is configured with contextIsolation, sandbox, and no nodeIntegration; file access from the renderer is restricted to the selected export folder.

## Known limitations

- Windows-first: the packaged installer targets Windows (NSIS + portable). macOS/Linux builds are not currently provided.
- Large chats (hundreds of thousands of messages) are supported but memory usage scales with chat size, since the database runs in-memory via WASM.
- Only single-chat HTML exports are supported; multi-chat export folders are not yet handled.

## Contributing

Issues and pull requests are welcome. Please don't include real chat exports, screenshots with personal information, or any third-party copyrighted media in issues or PRs.

## License

MIT — see [LICENSE](./LICENSE).

## Disclaimer
Telegram Archive Viewer is an independent, free, non-commercial, open-source project created by Jared Lee. It is not affiliated with, endorsed by, sponsored by, or officially connected to Telegram FZ-LLC or Telegram Messenger Inc.
