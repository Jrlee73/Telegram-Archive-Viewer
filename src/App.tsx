import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TelegramChat, MediaCategory } from './types';
import { sqliteService } from './services/sqliteService';
import { mediaService } from './services/mediaService';
import { ChatView } from './components/ChatView';
import { SearchModal } from './components/SearchModal';
import { ImportModal } from './components/ImportModal';
import { SettingsModal, SettingsCategory } from './components/SettingsModal';
import { MediaViewerModal } from './components/MediaViewerModal';
import { MediaModal } from './components/MediaModal';
import { AppLogo } from './components/AppLogo';
import { PasscodeLockOverlay } from './components/PasscodeLockOverlay';
import { WelcomeScreen } from './components/WelcomeScreen';
import { DuplicateInstanceModal } from './components/DuplicateInstanceModal';
import { instanceService } from './services/instanceService';
import { useTheme } from './context/ThemeContext';
import {
  FolderUp,
  RefreshCw,
  ShieldCheck,
  Database,
  X,
  Sparkles,
} from 'lucide-react';
import { APP_INFO } from './config/appinfo';

export function App() {
  const [activeChat, setActiveChat] = useState<TelegramChat | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [, setMediaStateUpdated] = useState(0);
  const [perspectiveIdentity, setPerspectiveIdentity] = useState<string | null>(null);
  const [participants, setParticipants] = useState<
    Array<{ name: string; count: number; initials: string; color: string }>
  >([]);
  const [isDuplicateInstance, setIsDuplicateInstance] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const getPositionRef = React.useRef<(() => { chatId: string; scrollOffset: number; topIndex: number } | null) | null>(null);

  // First-launch experience tracking
  const [hasLaunched, setHasLaunched] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tav_has_launched') === 'true';
    } catch {
      return false;
    }
  });

  const handleGetStarted = () => {
    try {
      localStorage.setItem('tav_has_launched', 'true');
    } catch {}
    setHasLaunched(true);
  };

  // Single-instance protection listener
  useEffect(() => {
    const unsub = instanceService.subscribe((isDuplicate) => {
      setIsDuplicateInstance(isDuplicate);
    });
    return unsub;
  }, []);

  // Initialize SQLite on startup and restore any saved chats
  useEffect(() => {
    sqliteService.init().then(() => {
      const storedChats = sqliteService.getAllChats();
      if (storedChats && storedChats.length > 0) {
        setChats(storedChats);
        let savedChatId: string | null = null;
        let didSaveOnExit = localStorage.getItem('tav_did_save_on_exit') === 'true';
        if (!didSaveOnExit && localStorage.getItem('tav_did_save_on_exit') === null) {
          didSaveOnExit = sqliteService.getSetting('did_save_on_exit') === 'true';
        }

        if (didSaveOnExit) {
          try {
            let lastPosRaw = localStorage.getItem('tav_last_exit_position');
            if (!lastPosRaw) {
              lastPosRaw = sqliteService.getSetting('last_exit_position');
            }
            if (lastPosRaw) {
              const parsed = JSON.parse(lastPosRaw);
              if (parsed && parsed.chatId) {
                savedChatId = parsed.chatId;
              }
            }
          } catch {}
        }

        const defaultChat = (savedChatId && storedChats.find((c) => c.id === savedChatId)) || storedChats[0];
        setActiveChat(defaultChat);
        const identity = sqliteService.getPerspectiveIdentity(defaultChat.id);
        setPerspectiveIdentity(identity);
        const pts = sqliteService.getParticipants(defaultChat.id);
        setParticipants(pts);
      }
    });

    const unsubscribe = mediaService.subscribe(() => {
      setMediaStateUpdated((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  // Update perspective identity and participants when active chat changes (no background auto-saving)
  useEffect(() => {
    if (activeChat) {
      const identity = sqliteService.getPerspectiveIdentity(activeChat.id);
      setPerspectiveIdentity(identity);
      const pts = sqliteService.getParticipants(activeChat.id);
      setParticipants(pts);
    } else {
      setPerspectiveIdentity(null);
      setParticipants([]);
    }
  }, [activeChat?.id]);

  // Handle intercept close logic for Electron
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeChat) {
        return;
      }
      e.preventDefault();
      e.returnValue = '';
      setShowExitConfirm(true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeChat]);

  const handleExitSave = async () => {
    if (getPositionRef.current) {
      const pos = getPositionRef.current();
      if (pos) {
        try {
          localStorage.setItem('tav_did_save_on_exit', 'true');
          localStorage.setItem('tav_last_exit_position', JSON.stringify(pos));
          sqliteService.setSetting('did_save_on_exit', 'true');
          sqliteService.setSetting('last_exit_position', JSON.stringify(pos));
        } catch (err) {
          console.error('Error saving exit position:', err);
        }
      }
    }
    if (window.electronAPI) {
      await window.electronAPI.closeApp();
    }
  };

  const handleExitDiscard = async () => {
    try {
      localStorage.setItem('tav_did_save_on_exit', 'false');
      localStorage.removeItem('tav_last_exit_position');
      sqliteService.setSetting('did_save_on_exit', 'false');
      sqliteService.removeSetting('last_exit_position');
    } catch (err) {
      console.error('Error discarding exit position:', err);
    }
    if (window.electronAPI) {
      await window.electronAPI.closeApp();
    }
  };

  const handleExitCancel = () => {
    setShowExitConfirm(false);
  };

  const handleSelectPerspective = (name: string | null) => {
    if (activeChat) {
      sqliteService.setPerspectiveIdentity(activeChat.id, name);
    }
    setPerspectiveIdentity(name);
  };

  const [isFloatingNoticeDismissed, setIsFloatingNoticeDismissed] = useState(false);

  // Compute all unique chats from registered chats
  const allAvailableChats = useMemo(() => {
    const chatMap = new Map<string, TelegramChat>();
    chats.forEach((c) => chatMap.set(c.id, c));
    if (activeChat) chatMap.set(activeChat.id, activeChat);
    return Array.from(chatMap.values());
  }, [chats, activeChat]);

  const totalCount = useMemo(() => {
    if (!activeChat) return 0;
    const c = sqliteService.getMessageCount(activeChat.id);
    return c > 0 ? c : activeChat.totalMessages || 0;
  }, [activeChat, chats]);

  // Modals state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDatabaseOpen, setIsDatabaseOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | null>(null);

  // Dedicated Media Browser Modal State
  const [mediaBrowserModal, setMediaBrowserModal] = useState<{
    isOpen: boolean;
    initialCategory: MediaCategory;
  }>({
    isOpen: false,
    initialCategory: 'photos',
  });

  const handleSelectChat = useCallback((c: TelegramChat) => {
    setActiveChat(c);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setHighlightTarget(null);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleOpenMediaLightBox = useCallback((url: string, title?: string, type?: string, stickerFormat?: string) => {
    setMediaModal({
      isOpen: true,
      url,
      title,
      type,
      stickerFormat,
    });
  }, []);

  const handleOpenMediaCategory = useCallback((category: MediaCategory) => {
    setMediaBrowserModal({
      isOpen: true,
      initialCategory: category,
    });
  }, []);

  const handleOpenImport = useCallback(() => {
    setIsImportOpen(true);
  }, []);

  const handleOpenDatabase = useCallback((cat?: SettingsCategory | null) => {
    setSettingsCategory(cat || null);
    setIsDatabaseOpen(true);
  }, []);

  const handleOpenPerspective = useCallback(() => {
    setSettingsCategory('chat');
    setIsDatabaseOpen(true);
  }, []);

  const handleOpenInfo = useCallback(() => {
    setSettingsCategory('about');
    setIsDatabaseOpen(true);
  }, []);

  const handleJumpFromMedia = useCallback((chatId: string, msgId: number) => {
    setMediaBrowserModal((prev) => ({ ...prev, isOpen: false }));
    const targetChat = allAvailableChats.find((c) => c.id === chatId);
    if (targetChat && activeChat?.id !== chatId) {
      setActiveChat(targetChat);
    }
    setHighlightTarget({ msgId, timestamp: Date.now() });
  }, [allAvailableChats, activeChat?.id]);

  // Jump / Highlight target
  const [highlightTarget, setHighlightTarget] = useState<{
    msgId: number;
    timestamp: number;
  } | null>(null);

  // Media Lightbox
  const [mediaModal, setMediaModal] = useState<{
    isOpen: boolean;
    url: string;
    title?: string;
    type?: string;
    stickerFormat?: string;
  }>({
    isOpen: false,
    url: '',
    title: '',
    type: 'photo',
    stickerFormat: undefined,
  });

  // Global hotkeys (Ctrl+F -> Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsImportOpen(false);
        setIsSearchOpen(false);
        setIsDatabaseOpen(false);
        setMediaBrowserModal((m) => ({ ...m, isOpen: false }));
        setMediaModal((m) => ({ ...m, isOpen: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleImportComplete = (newChats: TelegramChat[]) => {
    try {
      localStorage.setItem('tav_has_launched', 'true');
    } catch {}
    setHasLaunched(true);

    const storedChats = sqliteService.getAllChats();
    let currentActive: TelegramChat | null = null;
    if (storedChats && storedChats.length > 0) {
      setChats(storedChats);
      if (newChats.length > 0) {
        currentActive = storedChats.find((c) => c.id === newChats[0].id) || storedChats[0];
      } else {
        currentActive = storedChats[0];
      }
    } else if (newChats.length > 0) {
      setChats(newChats);
      currentActive = newChats[0];
    }

    if (currentActive) {
      setActiveChat(currentActive);
      const identity = sqliteService.getPerspectiveIdentity(currentActive.id);
      setPerspectiveIdentity(identity);
      const pts = sqliteService.getParticipants(currentActive.id);
      setParticipants(pts);
    }
  };

  const handleJumpFromSearch = (chatId: string, msgId: number) => {
    if (!activeChat || activeChat.id !== chatId) {
      const targetChat = chats.find((c) => c.id === chatId);
      if (targetChat) {
        setActiveChat(targetChat);
      }
    }
    setHighlightTarget({ msgId, timestamp: Date.now() });
    setIsSearchOpen(false);
  };

  const exportInfo = mediaService.getExportInfo();
  const hasLoadedChats = !!activeChat || chats.length > 0;
  const isMediaActive = mediaService.isMediaDirectoryActive();
  const showRelinkBanner = hasLoadedChats && !isMediaActive && exportInfo;

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden font-sans select-none">
      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {activeChat ? (
          <ChatView
            chat={activeChat}
            chats={allAvailableChats}
            onSelectChat={handleSelectChat}
            participants={participants}
            highlightTarget={highlightTarget}
            onClearHighlight={handleClearHighlight}
            onOpenSearch={handleOpenSearch}
            onOpenMedia={handleOpenMediaLightBox}
            onOpenMediaCategory={handleOpenMediaCategory}
            onOpenImport={handleOpenImport}
            onOpenDatabase={handleOpenDatabase}
            onOpenPerspective={handleOpenPerspective}
            onOpenInfo={handleOpenInfo}
            perspectiveIdentity={perspectiveIdentity}
            totalMessagesCount={totalCount}
            getPositionRef={getPositionRef}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-app)] relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Empty State Card */}
            <div className="glass-panel rounded-3xl p-8 sm:p-10 max-w-md w-full shadow-xl flex flex-col items-center border border-[var(--border-subtle)] relative z-10 animate-in fade-in zoom-in-95 duration-200">
              {/* App Logo Display Area */}
              <AppLogo />

              <h2 className="text-lg font-bold text-[var(--text-main)] mb-2 tracking-tight">
                No Archive Loaded
              </h2>
              <p className="text-[var(--text-secondary)] text-xs max-w-sm mb-6 leading-relaxed">
                Select your exported Telegram chat folder containing <code className="text-[var(--text-main)] bg-[var(--bg-surface-hover)] px-1.5 py-0.5 rounded font-mono text-[11px] border border-[var(--border-subtle)]">messages.html</code> to view your chat history offline with full search, media playback, and analytics.
              </p>

              {/* Feature Details */}
              <div className="grid grid-cols-2 gap-2.5 w-full mb-6 text-left">
                <div className="p-2.5 rounded-xl bg-[var(--bg-surface-card)] border border-[var(--border-card)] flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-[11px] text-[var(--text-secondary)]">100% Offline & Private</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-surface-card)] border border-[var(--border-card)] flex items-center gap-2 text-xs">
                  <Database className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span className="text-[11px] text-[var(--text-secondary)]">Local SQLite Engine</span>
                </div>
              </div>

              <button
                id="empty-state-import-btn"
                onClick={() => setIsImportOpen(true)}
                className="w-full py-3 px-5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] btn-press"
              >
                <FolderUp className="w-4 h-4" />
                <span>Select Export Folder</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. Floating Glass UI Information Bar (does not occupy top document flow) */}
        {showRelinkBanner && !isFloatingNoticeDismissed && (
          <div className="fixed bottom-6 right-6 z-40 max-w-sm glass-modal rounded-2xl p-4 shadow-2xl border border-[var(--border-subtle)] flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
              </div>
              <div className="min-w-0 text-xs">
                <div className="font-bold text-[var(--text-main)] truncate">
                  Media Folder Link
                </div>
                <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-tight">
                  Archive loaded from SQLite: <strong className="text-[var(--text-main)] font-medium">{exportInfo.folderName}</strong>. Select the folder to activate inline media.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsImportOpen(true)}
                className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-semibold transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                Select Folder
              </button>
              <button
                onClick={() => setIsFloatingNoticeDismissed(true)}
                className="w-7 h-7 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        chats={allAvailableChats}
        activeChatId={activeChat?.id || ''}
        onJumpToMessage={handleJumpFromSearch}
      />

      {/* Archive HTML Importer Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Reorganized Settings & Data Management Modal (Category Menu First) */}
      <SettingsModal
        isOpen={isDatabaseOpen}
        onClose={() => {
          setIsDatabaseOpen(false);
          setSettingsCategory(null);
        }}
        chats={allAvailableChats}
        activeChat={activeChat}
        participants={participants}
        perspectiveIdentity={perspectiveIdentity}
        onSelectPerspective={handleSelectPerspective}
        initialCategory={settingsCategory}
        onOpenImport={() => setIsImportOpen(true)}
        onClearImportedData={() => {
          setActiveChat(null);
          setChats([]);
          setPerspectiveIdentity(null);
          setHighlightTarget(null);
        }}
      />

      {/* Dedicated Media Gallery & Files Browser Modal */}
      <MediaModal
        isOpen={mediaBrowserModal.isOpen}
        onClose={() => setMediaBrowserModal((prev) => ({ ...prev, isOpen: false }))}
        chats={allAvailableChats}
        activeChat={activeChat}
        initialCategory={mediaBrowserModal.initialCategory}
        onOpenMediaItem={handleOpenMediaLightBox}
        onJumpToMessage={handleJumpFromMedia}
      />

      {/* Media Lightbox Viewer Modal */}
      <MediaViewerModal
        isOpen={mediaModal.isOpen}
        onClose={() => setMediaModal((m) => ({ ...m, isOpen: false }))}
        mediaUrl={mediaModal.url}
        mediaTitle={mediaModal.title}
        mediaType={mediaModal.type}
        stickerFormat={mediaModal.stickerFormat}
      />

      {/* Passcode Security Lock Overlay */}
      <PasscodeLockOverlay />

      {/* First-Launch Welcome Screen */}
      {!hasLaunched && chats.length === 0 && (
        <WelcomeScreen onGetStarted={handleGetStarted} />
      )}

      {/* Single-Instance Protection Modal */}
      <DuplicateInstanceModal isOpen={isDuplicateInstance} />

      {/* Save Position On Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-md glass-modal rounded-3xl shadow-2xl flex flex-col border border-[var(--border-subtle)] overflow-hidden">
            <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-card)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                    Exit Application
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Save current viewing position before exiting?
                  </p>
                </div>
              </div>
              <button
                onClick={handleExitCancel}
                className="w-8 h-8 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-xs text-[var(--text-secondary)] space-y-3 bg-[var(--bg-surface-card)]">
              <p className="leading-relaxed">
                Save current viewing position before exiting?
              </p>
              {activeChat && (
                <div className="p-3 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)] flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px] font-bold font-sans">
                    {activeChat.initials || 'TC'}
                  </div>
                  <div className="truncate text-[11px]">
                    <span className="text-[var(--text-muted)] block text-[10px]">Active Chat</span>
                    <strong className="text-[var(--text-main)] font-semibold">{activeChat.title}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-[var(--bg-surface-card)] border-t border-[var(--border-subtle)] flex items-center justify-end gap-2.5">
              <button
                onClick={handleExitCancel}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-secondary)] hover:text-[var(--text-main)] cursor-pointer transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleExitDiscard}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 cursor-pointer transition-all active:scale-95 border border-red-500/20"
              >
                No
              </button>
              <button
                onClick={handleExitSave}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white cursor-pointer transition-all shadow-md shadow-blue-500/15 active:scale-95"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
