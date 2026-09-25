export type MediaCategory = 'photos' | 'videos' | 'gifs' | 'music' | 'files' | 'links';

export interface ReplyInfo {
  msgId: number;
  text?: string;
  sender?: string;
}

export interface ForwardInfo {
  from: string;
  date: string;
}

export interface MediaItem {
  type: 'photo' | 'sticker' | 'video' | 'audio' | 'voice' | 'call' | 'file';
  stickerFormat?: 'webp' | 'tgs' | 'webm';
  title?: string;
  details?: string;
  url?: string;
  thumbUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  lottieData?: any;
}

export interface ReactionItem {
  emoji: string;
  count: number;
  users: string[];
}

export interface TelegramMessage {
  seq?: number;
  id: number;
  chatId: string;
  msgType: 'default' | 'service' | 'joined';
  senderName?: string;
  senderInitials?: string;
  senderColor?: string; // 'userpic1' - 'userpic8'
  dateText?: string;
  timeText?: string;
  dateDay?: string;
  textContent?: string;
  replyTo?: ReplyInfo;
  forwardInfo?: ForwardInfo;
  media?: MediaItem;
  reactions?: ReactionItem[];
  sourceFile?: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  chatType: 'personal' | 'group' | 'channel';
  totalMessages: number;
  lastMessage?: string;
  lastDate?: string;
  initials: string;
  colorClass: string;
  unreadCount?: number;
}

export interface SearchMatch {
  message: TelegramMessage;
  chatTitle: string;
  highlightSnippet: string;
}

export interface DatabaseStats {
  dbPath: string;
  journalMode: string;
  fileSizeMb: number;
  totalChats: number;
  totalMessages: number;
  totalMediaFiles: number;
  ftsIndexed: boolean;
}

export interface ElectronFileEntry {
  name: string;
  fullPath: string;
  relativePath: string;
  size: number;
}

export interface ElectronDirectoryResult {
  path: string;
  name: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  selectExportDirectory: () => Promise<ElectronDirectoryResult | null>;
  readDirectoryFiles: (dirPath: string) => Promise<ElectronFileEntry[]>;
  readFileAsText: (filePath: string) => Promise<string>;
  readMultipleFilesAsText?: (filePaths: string[]) => Promise<Record<string, string>>;
  readFileAsBlobUrl: (filePath: string, mimeType?: string) => Promise<string | null>;
  getExportFolderInfo: (dirPath: string) => Promise<{ path: string; name: string; totalFiles: number; files: ElectronFileEntry[] } | null>;
  checkDirectoryExists: (dirPath: string) => Promise<boolean>;
  getSetting: (key: string) => Promise<any>;
  setSetting: (key: string, val: any) => Promise<boolean>;
  getExportRoot: () => Promise<{ path: string | null; name: string | null }>;
  setExportRoot: (rootPath: string, rootName?: string) => Promise<boolean>;
  openInSystemApp: (relativePath: string) => Promise<boolean>;
  closeApp: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

