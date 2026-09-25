import React, { useState, useEffect } from 'react';
import { TelegramChat } from '../types';
import { sqliteService } from '../services/sqliteService';
import { mediaService } from '../services/mediaService';
import { useTheme, BUBBLE_COLOR_OPTIONS, BubbleColorId, Theme } from '../context/ThemeContext';
import { getAvatarStyle, getSenderTextColor } from '../utils/telegramColors';
import { APP_INFO } from '../config/appinfo';
import { ToggleSwitch } from './ToggleSwitch';
import { PasscodeSetupModal } from './PasscodeSetupModal';
import { DataResetModal, DataResetCategories } from './DataResetModal';
import {
  X,
  Database,
  Palette,
  ShieldCheck,
  Info,
  RotateCw,
  FolderSync,
  Trash2,
  Check,
  Download,
  AlertTriangle,
  Sliders,
  UserCheck,
  Moon,
  Sun,
  Eye,
  MessageSquare,
  Sparkles,
  Copy,
  MessageCircle,
  HardDrive,
  Lock,
  ChevronRight,
  ChevronLeft,
  CheckCheck,
  Type,
  Maximize2,
  Sparkle,
  KeyRound,
  Clock,
  Laptop,
} from 'lucide-react';

export type SettingsCategory = 'chat' | 'data' | 'appearance' | 'privacy' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: TelegramChat[];
  activeChat?: TelegramChat | null;
  participants?: Array<{ name: string; count: number; initials: string; color: string }>;
  perspectiveIdentity?: string | null;
  onSelectPerspective?: (name: string | null) => void;
  onOpenImport?: () => void;
  onClearImportedData?: () => void;
  initialCategory?: SettingsCategory | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  chats,
  activeChat = null,
  participants = [],
  perspectiveIdentity = null,
  onSelectPerspective,
  onOpenImport,
  onClearImportedData,
  initialCategory = null,
}) => {
  const {
    theme,
    setTheme,
    bubbleColor,
    setBubbleColor,
    bubbleFontSize,
    setBubbleFontSize,
    showTimestamps,
    setShowTimestamps,
    compactSpacing,
    setCompactSpacing,
    showAvatars,
    setShowAvatars,
    previewPhotos,
    setPreviewPhotos,
    previewVideos,
    setPreviewVideos,
    displayStickers,
    setDisplayStickers,
    followSystemTheme,
    setFollowSystemTheme,
    autoDestructEnabled,
    setAutoDestructEnabled,
    passcodeLockEnabled,
    setPasscodeLockEnabled,
    passcode,
    autoLockTimeout,
    setAutoLockTimeout,
    resetSettingsToDefault,
  } = useTheme();

  // Data Reset Modal State
  const [showDataResetModal, setShowDataResetModal] = useState(false);

  // Passcode Setup Modal state
  const [passcodeModal, setPasscodeModal] = useState<{
    isOpen: boolean;
    mode: 'setup' | 'disable' | 'change';
  }>({
    isOpen: false,
    mode: 'setup',
  });

  // Selected category in settings
  const [activeCategory, setActiveCategory] = useState<SettingsCategory | null>(initialCategory);

  // Synchronize when initialCategory changes
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory((prev) => (prev !== initialCategory ? initialCategory : prev));
    }
  }, [initialCategory, isOpen]);

  // Operational states for Data & Storage
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // About page copy state
  const [copiedContact, setCopiedContact] = useState(false);

  // Storage Stats State
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalChats: 0,
    totalMediaFiles: 0,
    fileSizeMb: 0,
  });

  const [mediaStats, setMediaStats] = useState({
    photos: 0,
    videos: 0,
    stickers: 0,
    audio: 0,
    files: 0,
  });

  // Load storage statistics
  useEffect(() => {
    if (!isOpen) return;

    try {
      const dbStats = sqliteService.getStats();
      const catCounts = sqliteService.getMediaCategoryCounts();

      const exportInfo = mediaService.getExportInfo();
      const filesCount = exportInfo ? exportInfo.totalFiles : (dbStats.totalMediaFiles || mediaService.getTotalMediaCount());

      setStats({
        totalMessages: dbStats.totalMessages,
        totalChats: dbStats.totalChats,
        totalMediaFiles: filesCount,
        fileSizeMb: dbStats.fileSizeMb,
      });

      setMediaStats(catCounts);
    } catch {
      // Fallback safe state
    }
  }, [isOpen, chats]);

  if (!isOpen) return null;

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // Actions
  const handleRebuildMediaIndex = async () => {
    setIsRebuilding(true);
    setFeedbackMessage(null);
    try {
      if (isElectron && window.electronAPI) {
        const root = await window.electronAPI.getExportRoot();
        if (root && root.path) {
          const diskFiles = await window.electronAPI.readDirectoryFiles(root.path);
          const rebuildResult = sqliteService.rebuildMediaIndex();
          setStats((prev) => ({
            ...prev,
            totalMediaFiles: diskFiles.length,
          }));
          setMediaStats(rebuildResult.countByCategory);
          setFeedbackMessage({
            type: 'success',
            text: `Disk scan complete: verified ${diskFiles.length.toLocaleString()} files on disk (${rebuildResult.totalMedia.toLocaleString()} media database entries updated).`,
          });
        } else {
          const count = mediaService.rebuildMediaIndex();
          setFeedbackMessage({
            type: 'success',
            text: `Media index refreshed. ${count.toLocaleString()} in-memory references active.`,
          });
        }
      } else {
        const count = mediaService.rebuildMediaIndex();
        setFeedbackMessage({
          type: 'success',
          text: `Media URL cache cleared. ${count.toLocaleString()} items ready for on-demand rendering.`,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Media indexing encountered an issue: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setIsRebuilding(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const handleExportDatabase = () => {
    try {
      const data = sqliteService.exportBinary();
      if (!data) {
        setFeedbackMessage({
          type: 'error',
          text: 'No active SQLite database in memory to export.',
        });
        return;
      }

      const blob = new Blob([data as any], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telegram_archive_export_${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setFeedbackMessage({
        type: 'success',
        text: 'SQLite database exported to your downloads folder.',
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Export failed: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const handleExecuteReset = async (categories: DataResetCategories) => {
    setIsClearing(true);
    try {
      const isCompleteReset = categories.chatData && categories.mediaCache && categories.settingsPreferences;

      if (isCompleteReset) {
        await sqliteService.clearAllData();
        mediaService.resetAll();
        resetSettingsToDefault();
        try {
          localStorage.clear();
        } catch {
          // ignore
        }
        if (onClearImportedData) {
          onClearImportedData();
        }
        onClose();
        // Return application to a true first-install state and trigger fresh start
        window.location.reload();
        return;
      }

      // Partial Reset Logic
      if (categories.chatData) {
        await sqliteService.clearChatData();
        try {
          localStorage.removeItem('tav_last_viewed_position');
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('tav_last_position_')) {
              localStorage.removeItem(key);
            }
          });
        } catch {}
        if (onClearImportedData) {
          onClearImportedData();
        }
      }

      if (categories.mediaCache) {
        mediaService.resetAll();
      }

      if (categories.settingsPreferences) {
        resetSettingsToDefault();
      }

      setFeedbackMessage({
        type: 'success',
        text: 'Selected local storage categories cleared successfully.',
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Failed to clear selected categories: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleChangeExportFolder = () => {
    onClose();
    if (onOpenImport) {
      onOpenImport();
    }
  };

  const handleCopyContact = () => {
    navigator.clipboard.writeText(APP_INFO.telegramContact);
    setCopiedContact(true);
    setTimeout(() => setCopiedContact(false), 2000);
  };

  const exportInfo = mediaService.getExportInfo();

  // Settings Categories configuration (Apple Settings hierarchy, NO performance category)
  const categories: Array<{
    id: SettingsCategory;
    title: string;
    subtitle: string;
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
  }> = [
    {
      id: 'chat',
      title: 'Chat Settings',
      subtitle: 'Perspective alignment, bubble sizes, accent hue & layout options',
      icon: MessageSquare,
      iconBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    {
      id: 'data',
      title: 'Data & Storage',
      subtitle: 'Indexed messages, media assets, export link & cache operations',
      icon: Database,
      iconBg: 'bg-purple-500/10 dark:bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
    {
      id: 'appearance',
      title: 'Appearance',
      subtitle: 'Light, Dark & OLED Night theme modes with live sample preview',
      icon: Palette,
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-500',
    },
    {
      id: 'privacy',
      title: 'Privacy',
      subtitle: '100% offline local storage design with zero tracking or telemetry',
      icon: ShieldCheck,
      iconBg: 'bg-teal-500/10 dark:bg-teal-500/20',
      iconColor: 'text-teal-500',
    },
    {
      id: 'about',
      title: 'About',
      subtitle: `Version v${APP_INFO.version} by ${APP_INFO.author} · System credits & contact`,
      icon: Info,
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
      iconColor: 'text-amber-500',
    },
  ];

  // Helper for rendering live interactive conversation sample preview
  const renderLivePreviewSample = () => {
    const activeColorHex = BUBBLE_COLOR_OPTIONS.find((o) => o.id === bubbleColor)?.color || '#2563eb';
    return (
      <div className="ios-inset-group p-4 select-none space-y-3 bg-[var(--bg-app)] border border-[var(--border-subtle)]">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
            Live Conversation Preview
          </span>
          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-card)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">
            {bubbleFontSize}px · {BUBBLE_COLOR_OPTIONS.find((o) => o.id === bubbleColor)?.name}
          </span>
        </div>

        <div className={`space-y-${compactSpacing ? '1.5' : '3'} flex flex-col`}>
          {/* Incoming Message Sample */}
          <div className="flex items-end gap-2 max-w-[85%]">
            {showAvatars && (
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                TG
              </div>
            )}
            <div className="bg-[var(--bubble-other)] text-[var(--bubble-other-text)] px-3.5 py-2 rounded-2xl rounded-bl-xs border border-[var(--bubble-other-border)] shadow-2xs">
              {showAvatars && (
                <div className="text-[11px] font-bold text-indigo-500 mb-0.5">
                  Alex Rivera
                </div>
              )}
              <div
                className="leading-relaxed"
                style={{ fontSize: `${bubbleFontSize}px` }}
              >
                Hi! Notice how all text sizes, colors, and bubble styles update instantly here.
              </div>
              {showTimestamps && (
                <div className="text-[9px] font-mono text-[var(--text-muted)] text-right mt-1">
                  10:42 AM
                </div>
              )}
            </div>
          </div>

          {/* Outgoing Message Sample */}
          <div className="flex items-end justify-end self-end max-w-[85%]">
            <div
              className="text-white px-3.5 py-2 rounded-2xl rounded-br-xs shadow-xs"
              style={{ backgroundColor: activeColorHex }}
            >
              <div
                className="leading-relaxed"
                style={{ fontSize: `${bubbleFontSize}px` }}
              >
                The new typography and OLED Night Mode look wonderfully crisp!
              </div>
              {showTimestamps && (
                <div className="flex items-center justify-end gap-1 text-[9px] font-mono opacity-85 text-right mt-1">
                  <span>10:43 AM</span>
                  <CheckCheck className="w-3 h-3 inline" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-200"
    >
      <div
        id="settings-modal-card"
        className="w-full max-w-3xl glass-modal rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-[var(--border-subtle)] animate-apple-modal"
      >
        {/* Apple Settings Navigation Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-card)] shrink-0">
          <div className="flex items-center gap-2">
            {activeCategory ? (
              <button
                onClick={() => setActiveCategory(null)}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity cursor-pointer px-2 py-1 -ml-2 rounded-lg hover:bg-[var(--bg-surface-hover)]"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Settings</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                    Settings & Data Management
                  </h2>
                </div>
              </div>
            )}
          </div>

          {/* Center Category Title when drilling down */}
          {activeCategory && (
            <div className="font-bold text-xs text-[var(--text-main)] truncate max-w-[200px] text-center">
              {categories.find((c) => c.id === activeCategory)?.title}
            </div>
          )}

          {/* Right Action: Done Button (Apple Style) */}
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-xs"
          >
            Done
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* STEP 1: Categories Overview List (When no category is selected) */}
          {!activeCategory && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="px-1">
                <p className="text-xs text-[var(--text-secondary)]">
                  Configure conversation perspective, chat bubble styles, storage archives, and appearance preferences.
                </p>
              </div>

              {/* Inset Group of Categories */}
              <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className="w-full ios-row cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 rounded-xl ${cat.iconBg} ${cat.iconColor} flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-semibold text-xs text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors">
                            {cat.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                            {cat.subtitle}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </div>

              {/* Version & Storage Quick Badge */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 font-mono">
                <span>{APP_INFO.name} v{APP_INFO.version}</span>
                <span>{stats.totalMessages.toLocaleString()} Messages Indexed</span>
              </div>
            </div>
          )}

          {/* STEP 2: Category Detailed Views */}

          {/* 1. Chat Settings Category */}
          {activeCategory === 'chat' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Conversation Perspective Selection (Three-Row Layout) */}
              <div className="space-y-2">
                <div className="px-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Conversation Perspective
                  </span>
                  <span className="text-[10px] font-mono text-[var(--accent)] font-semibold">
                    {perspectiveIdentity ? `Aligned: ${perspectiveIdentity}` : 'Neutral Observer'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] px-1 leading-relaxed">
                  Select your participant identity to align your messages to the right side as outgoing bubbles.
                </p>

                {/* Clean Horizontal Three-Row Card Layout */}
                <div className="ios-inset-group divide-y divide-[var(--border-subtle)] mt-2">
                  {/* Option 1: Neutral Observer */}
                  <button
                    onClick={() => {
                      if (activeChat && onSelectPerspective) {
                        sqliteService.setPerspectiveIdentity(activeChat.id, null);
                        onSelectPerspective(null);
                      }
                    }}
                    className={`w-full ios-row cursor-pointer text-left transition-colors ${
                      !perspectiveIdentity
                        ? 'bg-[var(--accent-soft)]'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-card)] flex items-center justify-center text-[var(--text-secondary)] font-bold shrink-0">
                        <Eye className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[var(--text-main)]">
                          Neutral Observer
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          Raw chronological export view without personal outgoing alignment
                        </div>
                      </div>
                    </div>
                    {!perspectiveIdentity && (
                      <Check className="w-4 h-4 text-[var(--accent)] shrink-0 ml-3" />
                    )}
                  </button>

                  {/* Option 2 & 3+: Detected Participants as Horizontal Rows */}
                  {participants.length > 0 ? (
                    participants.map((p) => {
                      const isCurrent = perspectiveIdentity === p.name;
                      const avatarStyle = getAvatarStyle(p.color);
                      return (
                        <button
                          key={p.name}
                          onClick={() => {
                            if (activeChat && onSelectPerspective) {
                              sqliteService.setPerspectiveIdentity(activeChat.id, p.name);
                              onSelectPerspective(p.name);
                            }
                          }}
                          className={`w-full ios-row cursor-pointer text-left transition-colors ${
                            isCurrent ? 'bg-[var(--accent-soft)]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs border border-black/5 dark:border-white/10"
                              style={avatarStyle}
                            >
                              {p.initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-[var(--text-main)] truncate">
                                {p.name}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                Align messages sent by {p.name} ({p.count.toLocaleString()} messages) as outgoing
                              </div>
                            </div>
                          </div>
                          {isCurrent && (
                            <Check className="w-4 h-4 text-[var(--accent)] shrink-0 ml-3" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                      {activeChat ? 'No individual participants detected yet.' : 'Load a chat archive to align personal perspective.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Bubble Text Size Slider */}
              <div className="space-y-2">
                <div className="px-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-blue-500" />
                    Bubble Text Size
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--text-main)] bg-[var(--bg-surface-card)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">
                    {bubbleFontSize}px
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] px-1">
                  Adjust message bubble typography size. The preview below updates dynamically.
                </p>

                <div className="ios-inset-group p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--text-muted)] font-semibold shrink-0">12px</span>
                    <input
                      type="range"
                      min={12}
                      max={22}
                      step={1}
                      value={bubbleFontSize}
                      onChange={(e) => setBubbleFontSize(Number(e.target.value))}
                      className="flex-1 accent-[var(--accent)] h-1.5 bg-[var(--border-card)] rounded-lg cursor-pointer"
                    />
                    <span className="text-[11px] text-[var(--text-muted)] font-semibold shrink-0">22px</span>
                  </div>

                  {/* Size Presets */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[
                      { label: 'Compact', size: 12 },
                      { label: 'Default', size: 13 },
                      { label: 'Medium', size: 15 },
                      { label: 'Large', size: 17 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setBubbleFontSize(preset.size)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-semibold cursor-pointer transition-all border ${
                          bubbleFontSize === preset.size
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                            : 'bg-[var(--bg-surface-card)] text-[var(--text-secondary)] border-[var(--border-card)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        {preset.label} ({preset.size}px)
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chat Bubble Accent Color Customization */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-emerald-500" />
                  Customize Chat Bubble Colors
                </span>
                <p className="text-[11px] text-[var(--text-muted)] px-1">
                  Choose a signature accent hue for your outgoing message bubbles.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  {BUBBLE_COLOR_OPTIONS.map((opt) => {
                    const isSelected = bubbleColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setBubbleColor(opt.id)}
                        className={`p-3 rounded-2xl border flex items-center gap-3 transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                            : 'border-[var(--border-card)] bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full shrink-0 shadow-2xs border border-white/20"
                          style={{ backgroundColor: opt.color }}
                        />
                        <span className="font-semibold text-xs text-[var(--text-main)] flex-1 text-left">
                          {opt.name}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview Sample */}
              {renderLivePreviewSample()}

              {/* Conversation Display Options (Apple Toggles) */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-500" />
                  Conversation Display Options
                </span>

                <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                  <div
                    onClick={() => setShowTimestamps(!showTimestamps)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Show Message Timestamps
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Display precise delivery time on message bubbles
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={showTimestamps}
                      onChange={setShowTimestamps}
                      ariaLabel="Show Message Timestamps"
                    />
                  </div>

                  <div
                    onClick={() => setCompactSpacing(!compactSpacing)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Compact Spacing
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Decrease vertical padding between bubbles to fit more content
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={compactSpacing}
                      onChange={setCompactSpacing}
                      ariaLabel="Compact Spacing"
                    />
                  </div>

                  <div
                    onClick={() => setShowAvatars(!showAvatars)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Show Sender Avatars
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Render colorful participant initial avatars beside incoming messages
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={showAvatars}
                      onChange={setShowAvatars}
                      ariaLabel="Show Sender Avatars"
                    />
                  </div>
                </div>
              </div>

              {/* Chat Media Display Settings */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-500" />
                  Chat Media Display
                </span>

                <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                  <div
                    onClick={() => setPreviewPhotos(!previewPhotos)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Preview Photos
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Display image thumbnails directly inside message bubbles
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={previewPhotos}
                      onChange={setPreviewPhotos}
                      ariaLabel="Preview Photos"
                    />
                  </div>

                  <div
                    onClick={() => setPreviewVideos(!previewVideos)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Preview Videos
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Display video previews and round video thumbnails in chat
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={previewVideos}
                      onChange={setPreviewVideos}
                      ariaLabel="Preview Videos"
                    />
                  </div>

                  <div
                    onClick={() => setDisplayStickers(!displayStickers)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Display Stickers
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Render static, animated, and video stickers inline
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={displayStickers}
                      onChange={setDisplayStickers}
                      ariaLabel="Display Stickers"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Data & Storage Category */}
          {activeCategory === 'data' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Feedback toast */}
              {feedbackMessage && (
                <div
                  className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
                    feedbackMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  }`}
                >
                  {feedbackMessage.type === 'success' ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedbackMessage.text}</span>
                </div>
              )}

              {/* Storage Information Metrics */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Storage Information
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-card)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Indexed Messages</span>
                    <span className="text-base font-bold text-[var(--text-main)] font-mono tabular-nums block mt-0.5">
                      {stats.totalMessages.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-card)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Total Chats</span>
                    <span className="text-base font-bold text-[var(--text-main)] font-mono tabular-nums block mt-0.5">
                      {stats.totalChats}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-card)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">SQLite Size</span>
                    <span className="text-base font-bold text-[var(--text-main)] font-mono tabular-nums block mt-0.5">
                      {stats.fileSizeMb.toFixed(2)} MB
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-card)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Media Assets</span>
                    <span className="text-base font-bold text-[var(--text-main)] font-mono tabular-nums block mt-0.5">
                      {stats.totalMediaFiles.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Media Breakdown */}
                <div className="ios-inset-group p-3.5 space-y-2">
                  <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider block">
                    Media Category Breakdown
                  </span>
                  <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono tabular-nums">
                    <div className="p-2 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Photos</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{mediaStats.photos}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Stickers</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{mediaStats.stickers}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Videos</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{mediaStats.videos}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Audio</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{mediaStats.audio}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Files</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{mediaStats.files}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Archive Management Operations */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-purple-500" />
                  Archive Management
                </span>

                <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                  <div className="ios-row">
                    <div>
                      <div className="font-semibold text-xs text-[var(--text-main)]">Export Folder Link</div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-sm mt-0.5">
                        {exportInfo ? exportInfo.folderName : 'No folder currently linked'}
                      </div>
                    </div>
                    <button
                      onClick={handleChangeExportFolder}
                      className="px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs flex items-center gap-1.5 active:scale-95 shrink-0"
                    >
                      <FolderSync className="w-3.5 h-3.5" />
                      <span>Relink Folder</span>
                    </button>
                  </div>

                  <div className="ios-row">
                    <div>
                      <div className="font-semibold text-xs text-[var(--text-main)]">
                        {isElectron ? 'Rebuild & Verify Media Index' : 'Clear Media URL Cache'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {isElectron
                          ? 'Rescan export directory on disk and verify SQLite media references'
                          : 'Clears cached blob URLs so media assets re-resolve from memory'}
                      </div>
                    </div>
                    <button
                      onClick={handleRebuildMediaIndex}
                      disabled={isRebuilding}
                      className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] text-xs font-semibold cursor-pointer transition-all border border-[var(--border-subtle)] flex items-center gap-1.5 active:scale-95 shrink-0 disabled:opacity-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
                      <span>{isRebuilding ? 'Processing...' : isElectron ? 'Rebuild Index' : 'Clear Cache'}</span>
                    </button>
                  </div>

                  <div className="ios-row">
                    <div>
                      <div className="font-semibold text-xs text-[var(--text-main)]">Export SQLite Database (.db)</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Save raw local SQLite database file to disk
                      </div>
                    </div>
                    <button
                      onClick={handleExportDatabase}
                      className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] text-xs font-semibold cursor-pointer transition-all border border-[var(--border-subtle)] flex items-center gap-1.5 active:scale-95 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export .db</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Danger Zone
                </span>

                <button
                  onClick={() => setShowDataResetModal(true)}
                  className="w-full p-3.5 rounded-2xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-rose-500 font-semibold text-xs transition-colors flex items-center justify-between cursor-pointer group"
                >
                  <div className="text-left">
                    <div className="font-semibold text-xs text-rose-500">Clear Local Database & Cache</div>
                    <div className="text-[11px] text-[var(--text-muted)] group-hover:text-rose-500/80 transition-colors mt-0.5">
                      Selectively delete Chat Data, Media & Cache, or Settings & Preferences
                    </div>
                  </div>
                  <Trash2 className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* 3. Appearance Category */}
          {activeCategory === 'appearance' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* System Theme Synchronization */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-blue-500" />
                  System Appearance
                </span>

                <div className="ios-inset-group">
                  <div
                    onClick={() => setFollowSystemTheme(!followSystemTheme)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Follow System Theme
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Automatically match operating system appearance (Light / Dark) whenever supported
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={followSystemTheme}
                      onChange={setFollowSystemTheme}
                      ariaLabel="Follow System Theme"
                    />
                  </div>
                </div>
              </div>

              {/* Theme Mode Selection (Light, Dark, Night) */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-500" />
                  Theme Mode
                </span>
                <p className="text-[11px] text-[var(--text-muted)] px-1">
                  Choose between Light, Dark, or deep OLED Night mode. Each palette is tuned for clarity and comfort.
                </p>

                {/* 3 Theme Options */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {/* Light Mode */}
                  <button
                    onClick={() => setTheme('light')}
                    className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                      theme === 'light'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                        : 'border-[var(--border-card)] bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4 text-amber-500" />
                        <span className="font-semibold text-xs text-[var(--text-main)]">Light Mode</span>
                      </div>
                      {theme === 'light' && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] mt-2">
                      Clean porcelain surfaces & crisp typography
                    </span>
                  </button>

                  {/* Dark Mode */}
                  <button
                    onClick={() => setTheme('dark')}
                    className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                      theme === 'dark'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                        : 'border-[var(--border-card)] bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Moon className="w-4 h-4 text-indigo-400" />
                        <span className="font-semibold text-xs text-[var(--text-main)]">Dark Mode</span>
                      </div>
                      {theme === 'dark' && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] mt-2">
                      Deep obsidian slate & calm neon blue
                    </span>
                  </button>

                  {/* Night Mode (OLED) */}
                  <button
                    onClick={() => setTheme('night')}
                    className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                      theme === 'night'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                        : 'border-[var(--border-card)] bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkle className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold text-xs text-[var(--text-main)]">Night Mode</span>
                      </div>
                      {theme === 'night' && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] mt-2">
                      True OLED deep black & neutral contrast
                    </span>
                  </button>
                </div>
              </div>

              {/* Live Preview Sample */}
              {renderLivePreviewSample()}

              {/* Typography Spec */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-emerald-500" />
                  UI Typography & Typeface
                </span>
                <div className="ios-inset-group p-4 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">Primary UI Typeface</span>
                    <span className="font-medium text-[var(--text-main)]">Plus Jakarta Sans (Google Fonts)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">Data & Monospace Font</span>
                    <span className="font-mono text-[var(--text-main)]">JetBrains Mono (Tabular Nums)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Privacy Category */}
          {activeCategory === 'privacy' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
                  <ShieldCheck className="w-5 h-5" />
                  <span>100% Offline & Private by Design</span>
                </div>
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[var(--text-main)] space-y-2 text-xs leading-relaxed">
                  <p>
                    <strong>Telegram Archive Viewer</strong> does not upload, synchronize, or collect any user data or chat logs.
                  </p>
                  <p>
                    All imported archives, databases, photos, and stickers remain stored strictly on your local machine. No tracking, telemetry, or remote analytics are collected.
                  </p>
                </div>
              </div>

              {/* Auto-Destruct Section */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  Auto-Destruct
                </span>

                <div className="ios-inset-group">
                  <div
                    onClick={() => setAutoDestructEnabled(!autoDestructEnabled)}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Auto-Destruct Local Data
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Automatically delete local SQLite database if application remains completely inactive for more than 5 minutes
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={autoDestructEnabled}
                      onChange={setAutoDestructEnabled}
                      ariaLabel="Auto-Destruct"
                    />
                  </div>
                </div>
              </div>

              {/* Passcode Lock Section */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-500" />
                  Passcode Lock
                </span>

                <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                  <div
                    onClick={() => {
                      if (!passcodeLockEnabled) {
                        setPasscodeModal({ isOpen: true, mode: 'setup' });
                      } else {
                        setPasscodeModal({ isOpen: true, mode: 'disable' });
                      }
                    }}
                    className="ios-row cursor-pointer select-none group"
                  >
                    <div className="pr-4">
                      <span className="font-semibold text-xs text-[var(--text-main)] block">
                        Passcode Lock
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Require a 4-digit PIN every time the app opens or after an inactivity timeout
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={passcodeLockEnabled}
                      onChange={(checked) => {
                        if (checked) {
                          setPasscodeModal({ isOpen: true, mode: 'setup' });
                        } else {
                          setPasscodeModal({ isOpen: true, mode: 'disable' });
                        }
                      }}
                      ariaLabel="Passcode Lock"
                    />
                  </div>

                  {passcodeLockEnabled && (
                    <div className="p-4 space-y-3 bg-[var(--bg-surface-card)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-[var(--accent)]" />
                          <span className="font-semibold text-xs text-[var(--text-main)]">
                            Auto-Lock Timeout
                          </span>
                        </div>
                        <button
                          onClick={() => setPasscodeModal({ isOpen: true, mode: 'change' })}
                          className="px-3 py-1 rounded-xl bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Change PIN</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {[
                          { label: 'Immediately', mins: 0 },
                          { label: '1 minute', mins: 1 },
                          { label: '3 minutes', mins: 3 },
                          { label: '5 minutes', mins: 5 },
                          { label: '10 minutes', mins: 10 },
                          { label: '20 minutes', mins: 20 },
                          { label: '30 minutes', mins: 30 },
                          { label: '1 hour', mins: 60 },
                        ].map((opt) => (
                          <button
                            key={opt.mins}
                            onClick={() => setAutoLockTimeout(opt.mins)}
                            className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                              autoLockTimeout === opt.mins
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-xs'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface-solid)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] italic px-1 pt-1">
                  Note: The passcode PIN gates app UI access and does not encrypt local storage or archive files on disk.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  Local Storage Architecture
                </span>
                <div className="ios-inset-group p-4 space-y-2.5 text-xs text-[var(--text-secondary)]">
                  <p>
                    Database files are held in local memory and backed by the local IndexedDB Virtual File System. When running as an Electron desktop app, files are read directly from your filesystem without copying to cloud locations.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 5. About Category */}
          {activeCategory === 'about' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* App Info Card */}
              <div className="ios-inset-group p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-[var(--accent)]" />
                    <span className="font-bold text-xs text-[var(--text-main)]">{APP_INFO.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    v{APP_INFO.version}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs pt-1">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Author</span>
                    <span className="font-bold text-[var(--text-main)] mt-0.5 block">{APP_INFO.author}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Created</span>
                    <span className="font-bold text-[var(--text-main)] mt-0.5 block font-mono">{APP_INFO.created}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase block">Version</span>
                    <span className="font-bold text-emerald-500 mt-0.5 block font-mono">{APP_INFO.version}</span>
                  </div>
                </div>
              </div>

              {/* Multi-AI Credits */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Credits
                </span>
                <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                  <div className="ios-row">
                    <span className="font-semibold text-blue-500">Gemini (Google AI Studio)</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Primary architecture & core features</span>
                  </div>
                  <div className="ios-row">
                    <span className="font-semibold text-emerald-500">ChatGPT</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Improvements & technical assistance</span>
                  </div>
                  <div className="ios-row">
                    <span className="font-semibold text-amber-500">Claude</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Bug fixing & refinement</span>
                  </div>
                  <div className="ios-row">
                    <span className="font-semibold text-purple-500">Grok</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Bug fixing</span>
                  </div>
                </div>
              </div>

              {/* Bug Reports & Feedback */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Bug Reports & Feedback
                </span>
                <div className="ios-inset-group p-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-[var(--text-main)] font-semibold block">Contact the Author</span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">{APP_INFO.telegramContact}</span>
                  </div>
                  <button
                    onClick={handleCopyContact}
                    className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                  >
                    {copiedContact ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedContact ? 'Copied' : 'Copy Contact'}</span>
                  </button>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] leading-relaxed space-y-1">
                <p>• This project is free to use.</p>
                <p>• The source code is publicly available.</p>
                <p>• Developed as an independent non-commercial project.</p>
                <p>• Created for viewing locally exported Telegram archives.</p>
                <p>• Telegram is a trademark of its respective owners and this project is not affiliated with Telegram.</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[var(--bg-surface-card)] border-t border-[var(--border-subtle)] flex justify-between items-center text-xs text-[var(--text-muted)] shrink-0">
          <span className="font-mono text-[11px]">
            {activeCategory
              ? `${categories.find((c) => c.id === activeCategory)?.title} · ${APP_INFO.name}`
              : `${APP_INFO.name} v${APP_INFO.version}`}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] font-mono">
            {stats.totalMessages.toLocaleString()} Messages
          </span>
        </div>
      </div>

      {/* Passcode Configuration Modal */}
      <PasscodeSetupModal
        isOpen={passcodeModal.isOpen}
        mode={passcodeModal.mode}
        onClose={() => setPasscodeModal((p) => ({ ...p, isOpen: false }))}
        onSuccess={() => {
          setFeedbackMessage({
            type: 'success',
            text:
              passcodeModal.mode === 'disable'
                ? 'Passcode Lock disabled successfully.'
                : 'Passcode updated successfully.',
          });
          setTimeout(() => setFeedbackMessage(null), 3000);
        }}
      />

      {/* Selectable Data Reset Modal */}
      <DataResetModal
        isOpen={showDataResetModal}
        onClose={() => setShowDataResetModal(false)}
        onExecuteReset={handleExecuteReset}
      />
    </div>
  );
};

export default SettingsModal;
