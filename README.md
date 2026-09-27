# Telegram Archive Viewer

A high-performance, privacy-focused desktop application built with Electron, React, and TypeScript to browse, search, and view exported Telegram chat archives.

## Features

- **Multi-Chat Management**: Seamlessly import, merge, and switch between multiple Telegram conversations within a single unified archive.
- **Blazing-Fast Message Viewing**: Smooth virtualized scrolling capable of effortlessly rendering tens of thousands of messages.
- **Flexible Import Strategies**: Choose between Replacing, Merging/Appending, or Adding as a New Chat when importing export archives.
- **Rich Media Support**: In-app viewing for photos, animated stickers, videos, voice messages, and file attachments.
- **Full-Text Search & Filtering**: Instant search across messages, senders, dates, and chat scopes.
- **Offline & Private**: Built on `sql.js` (SQLite in WebAssembly) with local IndexedDB persistence—no data leaves your machine.
- **Customizable Experience**: Light/dark themes, adjustable font sizes, and customizable interface settings.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Running in Development

To start the local Vite development server:

```bash
npm run dev
```

To run the application inside the Electron desktop shell in development:

```bash
npm run electron:dev
```

### Building the Windows Installer

To bundle the application and produce the standalone Windows NSIS installer and portable executable:

```bash
npm run electron:build
```

The compiled installer and portable distribution files will be output to the `release/` directory.
