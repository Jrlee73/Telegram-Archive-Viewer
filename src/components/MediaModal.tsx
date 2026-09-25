import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Image as ImageIcon,
  Film,
  Sparkles,
  Music2,
  FileText,
  Link2,
  ExternalLink,
  Play,
  Download,
  Search,
  CornerUpLeft,
  Calendar,
  User,
  Clock,
  Layers,
  FileCode,
  FolderOpen
} from 'lucide-react';
import { TelegramChat, TelegramMessage, MediaCategory } from '../types';
import { sqliteService } from '../services/sqliteService';
import { mediaService } from '../services/mediaService';
import { getAvatarStyle, getSenderTextColor } from '../utils/telegramColors';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: TelegramChat[];
  activeChat?: TelegramChat | null;
  initialCategory?: MediaCategory;
  onOpenMediaItem?: (url: string, title?: string, type?: string, stickerFormat?: string) => void;
  onJumpToMessage?: (chatId: string, msgId: number) => void;
}

interface ParsedLink {
  message: TelegramMessage;
  url: string;
  domain: string;
  title: string;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  isOpen,
  onClose,
  chats,
  activeChat = null,
  initialCategory = 'photos',
  onOpenMediaItem,
  onJumpToMessage,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>(initialCategory);
  const [selectedChatId, setSelectedChatId] = useState<string | 'all'>(
    activeChat ? activeChat.id : 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<TelegramMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState({
    photos: 0,
    videos: 0,
    gifs: 0,
    music: 0,
    files: 0,
    links: 0,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<number>(0);
  const PAGE_SIZE = 60;

  // Enable horizontal mouse wheel scrolling for the category pills
  const handleCategoryWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (categoryScrollRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      categoryScrollRef.current.scrollLeft += e.deltaY;
    }
  };

  // Sync category and chat when opened or initialCategory changes
  useEffect(() => {
    if (isOpen) {
      if (initialCategory) {
        setSelectedCategory(initialCategory);
      }
      if (activeChat) {
        setSelectedChatId(activeChat.id);
      }
    }
  }, [isOpen, initialCategory, activeChat?.id]);

  // Load category counts
  const loadCounts = useCallback(() => {
    const targetChatId = selectedChatId === 'all' ? undefined : selectedChatId;
    const counts = sqliteService.getMediaCategoryBreakdown(targetChatId);
    setCategoryCounts(counts);
  }, [selectedChatId]);

  useEffect(() => {
    if (isOpen) {
      loadCounts();
    }
  }, [isOpen, loadCounts]);

  // Load items from SQLite
  const loadItems = useCallback(
    (reset = false) => {
      if (!isOpen) return;
      setIsLoading(true);
      const currentOffset = reset ? 0 : offsetRef.current;
      const targetChatId = selectedChatId === 'all' ? undefined : selectedChatId;

      const results = sqliteService.getMediaItems(selectedCategory, {
        chatId: targetChatId,
        limit: PAGE_SIZE,
        offset: currentOffset,
        searchQuery,
      });

      if (reset) {
        setItems(results);
        offsetRef.current = results.length;
        setOffset(results.length);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      } else {
        setItems((prev) => [...prev, ...results]);
        offsetRef.current += results.length;
        setOffset((prev) => prev + results.length);
      }

      setHasMore(results.length >= PAGE_SIZE);
      setIsLoading(false);
    },
    [isOpen, selectedCategory, selectedChatId, searchQuery]
  );

  // Trigger load on filter changes
  useEffect(() => {
    if (isOpen) {
      loadItems(true);
    }
  }, [isOpen, selectedCategory, selectedChatId, searchQuery, loadItems]);

  // Scroll listener for infinite scroll
  const handleScroll = () => {
    if (!scrollContainerRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      loadItems(false);
    }
  };

  // Keyboard shortcut (Escape to close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Link parsing helper
  const parsedLinks = useMemo<ParsedLink[]>(() => {
    if (selectedCategory !== 'links') return [];
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`]+|www\.[^\s<>"{}|\\^`]+)/gi;
    const linksList: ParsedLink[] = [];

    items.forEach((msg) => {
      if (!msg.textContent) return;
      const matches = msg.textContent.match(urlRegex);
      if (matches) {
        matches.forEach((rawUrl) => {
          let fullUrl = rawUrl;
          if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = `https://${fullUrl}`;
          }
          let domain = 'link';
          try {
            domain = new URL(fullUrl).hostname.replace(/^www\./, '');
          } catch {
            domain = fullUrl.split('/')[0];
          }

          // Extract preview title from surrounding text
          const lines = msg.textContent?.split('\n').filter(Boolean) || [];
          const title =
            lines.find((l) => !l.includes(rawUrl)) ||
            msg.textContent?.replace(rawUrl, '').trim() ||
            domain;

          linksList.push({
            message: msg,
            url: fullUrl,
            domain,
            title: title.slice(0, 100),
          });
        });
      }
    });

    return linksList;
  }, [items, selectedCategory]);

  if (!isOpen) return null;

  const categories = [
    { id: 'photos' as MediaCategory, label: 'Photos', icon: ImageIcon, count: categoryCounts.photos },
    { id: 'videos' as MediaCategory, label: 'Videos', icon: Film, count: categoryCounts.videos },
    { id: 'gifs' as MediaCategory, label: 'GIFs', icon: Sparkles, count: categoryCounts.gifs },
    { id: 'music' as MediaCategory, label: 'Music', icon: Music2, count: categoryCounts.music },
    { id: 'files' as MediaCategory, label: 'Files', icon: FileText, count: categoryCounts.files },
    { id: 'links' as MediaCategory, label: 'Links', icon: Link2, count: categoryCounts.links },
  ];

  return (
    <div
      id="media-browser-modal"
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in select-none"
    >
      <div className="w-full max-w-5xl h-[88vh] glass-modal rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-subtle)]">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-card)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-xs shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                    Media Gallery & Files
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface-solid)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {categoryCounts[selectedCategory].toLocaleString()} items
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Browse photos, videos, audio, documents and links across your conversations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Chat Scope Selector */}
              <div className="flex items-center rounded-xl bg-[var(--bg-surface-hover)] p-0.5 border border-[var(--border-subtle)] text-xs">
                <button
                  onClick={() => setSelectedChatId(activeChat ? activeChat.id : 'all')}
                  disabled={!activeChat}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    selectedChatId !== 'all'
                      ? 'bg-[var(--bg-surface-solid)] text-[var(--text-main)] shadow-xs font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  } ${!activeChat ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {activeChat ? activeChat.title : 'Current Chat'}
                </button>
                <button
                  onClick={() => setSelectedChatId('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    selectedChatId === 'all'
                      ? 'bg-[var(--bg-surface-solid)] text-[var(--text-main)] shadow-xs font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  All Chats ({chats.length})
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Category Navigation Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Horizontally Scrollable Category Pills Group */}
            <div className="flex-1 min-w-0 relative">
              <div
                ref={categoryScrollRef}
                onWheel={handleCategoryWheel}
                className="flex items-center gap-2 overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain py-1 px-0.5"
              >
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setSearchQuery('');
                      }}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 shrink-0 select-none whitespace-nowrap cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                          : 'bg-[var(--bg-surface-solid)] text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="shrink-0">{cat.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-black/5 dark:bg-white/5 text-[var(--text-muted)]'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Search Input */}
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in ${selectedCategory}...`}
                className="w-full pl-8.5 pr-8 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="w-6 h-6 rounded-md absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {/* Photos View (Gallery Grid) */}
          {selectedCategory === 'photos' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((msg) => {
                const resolvedUrl = mediaService.resolveUrl(msg.media?.url);
                return (
                  <div
                    key={`${msg.chatId}_${msg.id}_${msg.seq}`}
                    onClick={() =>
                      onOpenMediaItem &&
                      onOpenMediaItem(
                        resolvedUrl || msg.media?.url || '',
                        msg.media?.title || 'Photo',
                        'photo'
                      )
                    }
                    className="group relative aspect-square rounded-2xl overflow-hidden bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] cursor-pointer shadow-xs hover:shadow-xl hover:border-[var(--accent)] transition-all duration-200"
                  >
                    {resolvedUrl ? (
                      <img
                        src={resolvedUrl}
                        alt={msg.media?.title || 'Photo'}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                          if (sibling) sibling.style.display = 'flex';
                        }}
                      />
                    ) : null}

                    {/* Placeholder fallback */}
                    <div
                      className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[var(--bg-surface-solid)]"
                      style={{ display: resolvedUrl ? 'none' : 'flex' }}
                    >
                      <ImageIcon className="w-8 h-8 text-[var(--text-muted)] mb-1 opacity-50" />
                      <span className="text-[10px] text-[var(--text-muted)] truncate max-w-full font-mono">
                        {msg.media?.title || 'Photo'}
                      </span>
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between text-white">
                      <div className="flex justify-end">
                        {onJumpToMessage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              onJumpToMessage(msg.chatId, msg.id);
                            }}
                            className="p-1.5 rounded-lg bg-black/60 hover:bg-[var(--accent)] text-white transition-colors"
                            title="Jump to message in chat"
                          >
                            <CornerUpLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold block truncate">
                          {msg.senderName || 'Unknown'}
                        </span>
                        <span className="text-[9px] text-white/70 font-mono">
                          {msg.timeText || msg.dateDay || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Videos View (Gallery Grid with duration pill) */}
          {selectedCategory === 'videos' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((msg) => {
                const resolvedUrl = mediaService.resolveUrl(msg.media?.url);
                return (
                  <div
                    key={`${msg.chatId}_${msg.id}_${msg.seq}`}
                    onClick={() =>
                      onOpenMediaItem &&
                      onOpenMediaItem(
                        resolvedUrl || msg.media?.url || '',
                        msg.media?.title || 'Video',
                        'video'
                      )
                    }
                    className="group relative aspect-square rounded-2xl overflow-hidden bg-black/20 dark:bg-black/40 border border-[var(--border-subtle)] cursor-pointer shadow-xs hover:shadow-xl hover:border-[var(--accent)] transition-all duration-200 flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    </div>

                    {/* Duration Badge */}
                    {msg.media?.duration && (
                      <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white font-mono text-[10px] font-semibold backdrop-blur-xs">
                        {msg.media.duration}
                      </div>
                    )}

                    {/* Top Jump to Chat Button */}
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onJumpToMessage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onJumpToMessage(msg.chatId, msg.id);
                          }}
                          className="p-1.5 rounded-lg bg-black/60 hover:bg-[var(--accent)] text-white transition-colors"
                          title="Jump to message in chat"
                        >
                          <CornerUpLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Bottom Sender & Title info on hover */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-6 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                      <span className="text-[11px] font-semibold block truncate">
                        {msg.media?.title || 'Video'}
                      </span>
                      <span className="text-[9px] text-white/70 block truncate">
                        {msg.senderName} · {msg.timeText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* GIFs View (Gallery Grid) */}
          {selectedCategory === 'gifs' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((msg) => {
                const resolvedUrl = mediaService.resolveUrl(msg.media?.url);
                return (
                  <div
                    key={`${msg.chatId}_${msg.id}_${msg.seq}`}
                    onClick={() =>
                      onOpenMediaItem &&
                      onOpenMediaItem(
                        resolvedUrl || msg.media?.url || '',
                        msg.media?.title || 'Animation',
                        msg.media?.type || 'video',
                        msg.media?.stickerFormat
                      )
                    }
                    className="group relative aspect-square rounded-2xl overflow-hidden bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] cursor-pointer shadow-xs hover:shadow-xl hover:border-[var(--accent)] transition-all duration-200 flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Sparkles className="w-6 h-6" />
                    </div>

                    {/* GIF Pill Badge */}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[var(--accent)] text-white font-mono text-[9px] font-bold uppercase tracking-wider shadow-xs">
                      GIF
                    </div>

                    {/* Jump to Chat Button */}
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onJumpToMessage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onJumpToMessage(msg.chatId, msg.id);
                          }}
                          className="p-1.5 rounded-lg bg-black/60 hover:bg-[var(--accent)] text-white transition-colors"
                          title="Jump to message in chat"
                        >
                          <CornerUpLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-6 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                      <span className="text-[11px] font-semibold block truncate">
                        {msg.media?.title || 'Animation'}
                      </span>
                      <span className="text-[9px] text-white/70 block truncate">
                        {msg.senderName} · {msg.timeText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Music View (Settings-style Structured List) */}
          {selectedCategory === 'music' && (
            <div className="space-y-2">
              <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                {items.map((msg) => {
                  const resolvedUrl = mediaService.resolveUrl(msg.media?.url);
                  return (
                    <div
                      key={`${msg.chatId}_${msg.id}_${msg.seq}`}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <button
                          onClick={() =>
                            onOpenMediaItem &&
                            onOpenMediaItem(
                              resolvedUrl || msg.media?.url || '',
                              msg.media?.title || 'Audio track',
                              'audio'
                            )
                          }
                          className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-500 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-xs"
                          title="Play Audio"
                        >
                          <Play className="w-4 h-4 ml-0.5 fill-current" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[var(--text-main)] truncate">
                            {msg.media?.title || 'Audio Recording'}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-0.5">
                            <span className="font-medium text-[var(--text-secondary)]">
                              {msg.senderName || 'User'}
                            </span>
                            <span>·</span>
                            <span className="font-mono text-[10px]">
                              {msg.dateDay || msg.dateText || ''} {msg.timeText ? `at ${msg.timeText}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {msg.media?.duration && (
                          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-solid)] text-[var(--text-muted)] font-mono text-[10px] font-semibold border border-[var(--border-subtle)]">
                            {msg.media.duration}
                          </span>
                        )}
                        {onJumpToMessage && (
                          <button
                            onClick={() => {
                              onClose();
                              onJumpToMessage(msg.chatId, msg.id);
                            }}
                            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-card)] transition-colors cursor-pointer"
                            title="Jump to message"
                          >
                            <CornerUpLeft className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Files View (Settings-style Structured List) */}
          {selectedCategory === 'files' && (
            <div className="space-y-2">
              <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                {items.map((msg) => {
                  const resolvedUrl = mediaService.resolveUrl(msg.media?.url);
                  const fileName = msg.media?.fileName || msg.media?.title || 'Document file';
                  const extension = fileName.split('.').pop()?.toUpperCase() || 'FILE';

                  return (
                    <div
                      key={`${msg.chatId}_${msg.id}_${msg.seq}`}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 font-mono text-[10px] font-bold shadow-xs">
                          {extension.slice(0, 4)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[var(--text-main)] truncate">
                            {fileName}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-0.5">
                            <span className="font-semibold font-mono text-[10px] text-[var(--accent)]">
                              {msg.media?.fileSize || 'Attachment'}
                            </span>
                            <span>·</span>
                            <span>{msg.senderName}</span>
                            <span>·</span>
                            <span className="font-mono text-[10px]">
                              {msg.dateDay || msg.dateText || ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {resolvedUrl && (
                          <a
                            href={resolvedUrl}
                            download={fileName}
                            className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        )}
                        {onJumpToMessage && (
                          <button
                            onClick={() => {
                              onClose();
                              onJumpToMessage(msg.chatId, msg.id);
                            }}
                            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-card)] transition-colors cursor-pointer"
                            title="Jump to message"
                          >
                            <CornerUpLeft className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Links View (Settings-style Structured List) */}
          {selectedCategory === 'links' && (
            <div className="space-y-2">
              <div className="ios-inset-group divide-y divide-[var(--border-subtle)]">
                {parsedLinks.map((linkItem, idx) => (
                  <div
                    key={`${linkItem.message.chatId}_${linkItem.message.id}_${idx}`}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-teal-500 flex items-center justify-center shrink-0 shadow-xs">
                        <Link2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--bg-surface-solid)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-mono">
                            {linkItem.domain}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] truncate">
                            {linkItem.message.senderName}
                          </span>
                        </div>
                        <a
                          href={linkItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--accent)] hover:underline block truncate mt-1"
                        >
                          {linkItem.url}
                        </a>
                        {linkItem.title && (
                          <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                            {linkItem.title}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={linkItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-[var(--bg-surface-solid)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors"
                        title="Open Link in Browser"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {onJumpToMessage && (
                        <button
                          onClick={() => {
                            onClose();
                            onJumpToMessage(linkItem.message.chatId, linkItem.message.id);
                          }}
                          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-card)] transition-colors cursor-pointer"
                          title="Jump to message"
                        >
                          <CornerUpLeft className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && items.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-[var(--bg-surface-solid)] flex items-center justify-center text-[var(--text-muted)] border border-[var(--border-subtle)]">
                <Layers className="w-6 h-6 opacity-40" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">
                No {selectedCategory} found
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm">
                {searchQuery
                  ? `No matches for "${searchQuery}" in ${selectedCategory}.`
                  : `No ${selectedCategory} available in ${
                      selectedChatId === 'all' ? 'any chat' : 'this conversation'
                    }.`}
              </p>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="p-6 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2 font-mono">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <span>Loading {selectedCategory}...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
