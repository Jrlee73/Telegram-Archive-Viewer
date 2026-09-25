import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TelegramChat, TelegramMessage, MediaCategory } from '../types';
import { sqliteService } from '../services/sqliteService';
import { useTheme } from '../context/ThemeContext';
import { MessageBubble } from './MessageBubble';
import { getAvatarStyle } from '../utils/telegramColors';
import { getChatHeaderDisplayInfo, OBSERVER_IDENTITY } from '../utils/chatHeader';
import { APP_INFO } from '../config/appinfo';
import {
  Search,
  ArrowDown,
  UserCheck,
  Lock,
  MessageSquare,
  Image as ImageIcon,
  Sliders,
  Menu,
  X,
  FolderUp,
  ChevronDown,
  Palette,
  Database,
  ShieldCheck,
  Info,
  Film,
  Sparkles,
  Music2,
  FileText,
  Link2,
  Layers,
} from 'lucide-react';

interface ChatViewProps {
  chat: TelegramChat;
  chats?: TelegramChat[];
  onSelectChat?: (chat: TelegramChat) => void;
  participants?: Array<{ name: string; count: number; initials: string; color: string }>;
  highlightTarget: { msgId: number; timestamp: number } | null;
  onClearHighlight?: () => void;
  onOpenSearch: () => void;
  onOpenMedia: (url: string, title?: string, type?: string, stickerFormat?: string) => void;
  onOpenMediaCategory?: (category: MediaCategory) => void;
  onOpenImport: () => void;
  onOpenDatabase: (category?: any) => void;
  onOpenPerspective?: () => void;
  onOpenInfo: () => void;
  perspectiveIdentity?: string | null;
  totalMessagesCount: number;
  getPositionRef?: React.MutableRefObject<(() => { chatId: string; scrollOffset: number; topIndex: number } | null) | null>;
}

// Content-aware initial height estimation before element measurement
function estimateMessageHeight(msg?: TelegramMessage): number {
  if (!msg) return 50;
  if (msg.msgType === 'service') return 36;
  let h = 48;
  if (msg.senderName && msg.msgType !== 'joined') h += 18;
  if (msg.forwardInfo) h += 22;
  if (msg.replyTo) h += 38;
  if (msg.media) {
    if (msg.media.type === 'photo') h += 204;
    else if (msg.media.type === 'sticker') h += 140;
    else if (msg.media.type === 'video') h += 160;
    else h += 60;
  }
  if (msg.textContent) {
    const lines = Math.max(1, Math.ceil(msg.textContent.length / 45));
    h += (lines - 1) * 18;
  }
  return h;
}

/**
 * Parses message date into a day number and full date representation.
 * - dayNum: Single/double digit day number for the compact circular bubble (e.g. "23")
 * - fullDate: Formatted full date for the expanded pill (e.g. "September 23, 2026")
 * Time is strictly excluded.
 */
export function formatMessageDate(msg?: TelegramMessage): { dayNum: string; fullDate: string } | null {
  if (!msg) return null;

  // 1. Try dateText (typically "YYYY-MM-DD HH:MM:SS" or ISO)
  if (msg.dateText) {
    const mYmd = msg.dateText.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (mYmd) {
      const year = parseInt(mYmd[1], 10);
      const month = parseInt(mYmd[2], 10) - 1;
      const day = parseInt(mYmd[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return {
          dayNum: String(day),
          fullDate: d.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        };
      }
    }
  }

  // 2. Try dateDay
  if (msg.dateDay) {
    const raw = msg.dateDay.trim();
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const day = parsed.getDate();
      return {
        dayNum: String(day),
        fullDate: parsed.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    }

    // Try "DD.MM.YYYY" or "DD/MM/YYYY" or "DD-MM-YYYY"
    const mDmy = raw.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
    if (mDmy) {
      const day = parseInt(mDmy[1], 10);
      const month = parseInt(mDmy[2], 10) - 1;
      const year = parseInt(mDmy[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return {
          dayNum: String(day),
          fullDate: d.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        };
      }
    }

    // Try "DD Month YYYY" e.g. "23 September 2026"
    const mText = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (mText) {
      const day = parseInt(mText[1], 10);
      return {
        dayNum: String(day),
        fullDate: `${mText[2]} ${day}, ${mText[3]}`,
      };
    }

    // Fallback: extract any 1-2 digit number
    const dayOnly = raw.match(/\b(\d{1,2})\b/);
    if (dayOnly) {
      return {
        dayNum: String(parseInt(dayOnly[1], 10)),
        fullDate: raw,
      };
    }
  }

  return null;
}

export const ChatView: React.FC<ChatViewProps> = ({
  chat,
  chats = [],
  onSelectChat,
  participants = [],
  highlightTarget,
  onClearHighlight,
  onOpenSearch,
  onOpenMedia,
  onOpenMediaCategory,
  onOpenImport,
  onOpenDatabase,
  onOpenPerspective,
  onOpenInfo,
  perspectiveIdentity,
  totalMessagesCount,
  getPositionRef,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [internalHighlight, setInternalHighlight] = useState<number | null>(null);
  const [highlightSession, setHighlightSession] = useState<number>(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isLeftMenuExpanded, setIsLeftMenuExpanded] = useState(true);
  const [isChatsListOpen, setIsChatsListOpen] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isMediaMenuExpanded, setIsMediaMenuExpanded] = useState(false);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Floating Date Bubble state
  const [activeDateInfo, setActiveDateInfo] = useState<{ dayNum: string; fullDate: string } | null>(null);
  const [isDateBubbleExpanded, setIsDateBubbleExpanded] = useState(false);
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleDateBubble = useCallback(() => {
    setIsDateBubbleExpanded((prev) => {
      const next = !prev;
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      if (next) {
        // Automatically return to compact circular state after 3.5 seconds
        collapseTimerRef.current = setTimeout(() => {
          setIsDateBubbleExpanded(false);
        }, 3500);
      }
      return next;
    });
  }, []);

  // Cleanup auto-collapse timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  // Initialize or reset date state on chat switch
  useEffect(() => {
    setIsDateBubbleExpanded(false);
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    if (chat.lastDate) {
      const parsed = formatMessageDate({
        id: 0,
        chatId: chat.id,
        msgType: 'default',
        dateText: chat.lastDate,
      });
      if (parsed) {
        setActiveDateInfo(parsed);
      }
    }
  }, [chat.id, chat.lastDate]);

  // Pure O(1) header info calculation using Conversation Perspective
  const headerInfo = useMemo(() => {
    return getChatHeaderDisplayInfo(chat, participants, perspectiveIdentity);
  }, [chat, participants, perspectiveIdentity]);

  // 1. Live count of messages for this chat in SQLite
  const [chatTotalCount, setChatTotalCount] = useState<number>(() => {
    const c = sqliteService.getMessageCount(chat.id);
    return c > 0 ? c : chat.totalMessages || 0;
  });

  useEffect(() => {
    const c = sqliteService.getMessageCount(chat.id);
    setChatTotalCount(c > 0 ? c : chat.totalMessages || 0);
  }, [chat.id, chat.totalMessages]);

  // 2. Chunked Message Cache: Map<index, TelegramMessage> & Block Tracker
  const [messageCache, setMessageCache] = useState<Map<number, TelegramMessage>>(new Map());
  const messageCacheRef = useRef(messageCache);
  messageCacheRef.current = messageCache;

  const loadedBlocksRef = useRef<Set<number>>(new Set());

  const activeChatIdRef = useRef(chat.id);
  activeChatIdRef.current = chat.id;

  // Clear cache & block tracker on chat change
  useEffect(() => {
    loadedBlocksRef.current.clear();
    setMessageCache(new Map());
  }, [chat.id]);

  // Load message blocks around a target range without causing re-render loops
  const ensureBlocksLoaded = useCallback((startIndex: number, endIndex: number) => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;

    const BLOCK_SIZE = 100;
    const startBlock = Math.max(0, Math.floor(startIndex / BLOCK_SIZE));
    const endBlock = Math.max(0, Math.floor(endIndex / BLOCK_SIZE));

    const missingBlocks: number[] = [];
    for (let b = startBlock; b <= endBlock; b++) {
      if (!loadedBlocksRef.current.has(b)) {
        missingBlocks.push(b);
      }
    }

    if (missingBlocks.length === 0) return;

    // Immediately mark missing blocks in ref to guarantee synchronous loop prevention
    missingBlocks.forEach((b) => loadedBlocksRef.current.add(b));

    const fetchStart = missingBlocks[0] * BLOCK_SIZE;
    const fetchLimit = (missingBlocks[missingBlocks.length - 1] - missingBlocks[0] + 1) * BLOCK_SIZE;

    const chunk = sqliteService.getMessagesChunk(chatId, fetchStart, fetchLimit);
    if (!chunk || chunk.length === 0) return;

    setMessageCache((prev) => {
      const next = new Map(prev);
      chunk.forEach((msg, i) => {
        next.set(fetchStart + i, msg);
      });

      // Memory limit: prune distant cached blocks if cache gets larger than 2000 items
      if (next.size > 2000) {
        const keepMinBlock = Math.max(0, startBlock - 5);
        const keepMaxBlock = endBlock + 5;

        for (const key of next.keys()) {
          const kBlock = Math.floor(key / BLOCK_SIZE);
          if (kBlock < keepMinBlock || kBlock > keepMaxBlock) {
            next.delete(key);
            loadedBlocksRef.current.delete(kBlock);
          }
        }
      }
      return next;
    });
  }, []);

  // 3. Viewport size, scroll tracking, and scroll container refs
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [clientHeight, setClientHeight] = useState(700);
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);
  const rowVirtualizerRef = useRef<any>(null);

  // 4. TanStack Virtualizer with standard native getScrollElement
  const rowVirtualizer = useVirtualizer({
    count: chatTotalCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: useCallback((index: number) => {
      const msg = messageCacheRef.current.get(index);
      return estimateMessageHeight(msg);
    }, []),
    overscan: 25,
    paddingStart: 76,
    paddingEnd: 28,
    getItemKey: useCallback((index: number) => index, []),
  });
  rowVirtualizerRef.current = rowVirtualizer;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualRangeKey = virtualItems.length > 0
    ? `${virtualItems[0].index}-${virtualItems[virtualItems.length - 1].index}`
    : '';

  // Handle native scroll events from viewport container
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    setScrollHeight(el.scrollHeight);
    setClientHeight(el.clientHeight);
  }, []);

  // Sync dimensions with ResizeObserver
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const updateSize = () => {
      if (!el) return;
      const ch = el.clientHeight || 700;
      const sh = el.scrollHeight || 0;
      const st = el.scrollTop || 0;
      setClientHeight((prev) => (prev !== ch ? ch : prev));
      setScrollHeight((prev) => (prev !== sh ? sh : prev));
      setScrollTop((prev) => (prev !== st ? st : prev));
    };

    updateSize();

    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateSize();
      });
    });

    ro.observe(el);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Load missing chunk data on visible virtual window changes
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const minIdx = virtualItems[0].index;
    const maxIdx = virtualItems[virtualItems.length - 1].index;

    ensureBlocksLoaded(minIdx, maxIdx);
  }, [virtualRangeKey, ensureBlocksLoaded]);

  // Track visible message date as the user scrolls through the chat
  useEffect(() => {
    const items = rowVirtualizerRef.current?.getVirtualItems() || [];
    if (items.length === 0) return;

    // Viewport threshold right below the floating header (~68px from top)
    const viewingThreshold = scrollTop + 68;

    let targetVirtual = items.find(
      (v: any) => v.start + (v.size || 50) >= viewingThreshold
    );
    if (!targetVirtual) {
      targetVirtual = items[0];
    }

    let msg = messageCache.get(targetVirtual.index);
    if (!msg || (!msg.dateText && !msg.dateDay)) {
      for (const v of items) {
        const candidate = messageCache.get(v.index);
        if (candidate && (candidate.dateText || candidate.dateDay)) {
          msg = candidate;
          break;
        }
      }
    }

    if (msg) {
      const parsed = formatMessageDate(msg);
      if (parsed) {
        setActiveDateInfo((prev) => {
          if (!prev || prev.dayNum !== parsed.dayNum || prev.fullDate !== parsed.fullDate) {
            return parsed;
          }
          return prev;
        });
      }
    }
  }, [virtualRangeKey, scrollTop, messageCache]);

  const maxScroll = Math.max(0, scrollHeight - clientHeight);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const el = viewportRef.current;
      if (!el) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        el.scrollTop -= 40;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        el.scrollTop += 40;
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        el.scrollTop -= el.clientHeight * 0.85;
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        el.scrollTop += el.clientHeight * 0.85;
      } else if (e.key === 'Home') {
        e.preventDefault();
        rowVirtualizer.scrollToOffset(0, { align: 'start', behavior: 'smooth' });
      } else if (e.key === 'End') {
        e.preventDefault();
        rowVirtualizer.scrollToIndex(chatTotalCount - 1, { align: 'end', behavior: 'smooth' });
      }
    },
    [chatTotalCount, rowVirtualizer]
  );

  // Custom scrollbar thumb geometry & drag handlers
  const trackHeight = clientHeight;
  const thumbHeight = scrollHeight > 0
    ? Math.min(trackHeight, Math.max(28, (clientHeight / scrollHeight) * trackHeight))
    : trackHeight;
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTop : 0;

  const handleThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingThumb(true);
      const startY = e.clientY;
      const startScrollTop = viewportRef.current ? viewportRef.current.scrollTop : 0;
      const trackEl = trackRef.current;
      const currentTrackHeight = trackEl ? trackEl.clientHeight : clientHeight;
      const currentScrollHeight = viewportRef.current ? viewportRef.current.scrollHeight : 0;
      const currentThumbHeight = currentScrollHeight > 0
        ? Math.min(currentTrackHeight, Math.max(28, (currentTrackHeight / currentScrollHeight) * currentTrackHeight))
        : currentTrackHeight;
      const currentMaxThumbTop = Math.max(1, currentTrackHeight - currentThumbHeight);
      const currentMaxScroll = Math.max(0, currentScrollHeight - currentTrackHeight);

      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const onPointerMove = (moveEv: PointerEvent) => {
        const deltaY = moveEv.clientY - startY;
        const deltaScroll = (deltaY / currentMaxThumbTop) * currentMaxScroll;
        if (viewportRef.current) {
          viewportRef.current.scrollTop = startScrollTop + deltaScroll;
        }
      };

      const onPointerUp = (upEv: PointerEvent) => {
        try {
          (e.target as HTMLElement).releasePointerCapture(upEv.pointerId);
        } catch {}
        setIsDraggingThumb(false);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [clientHeight]
  );

  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== trackRef.current) return;
      e.preventDefault();
      const trackEl = trackRef.current;
      if (!trackEl || !viewportRef.current) return;
      const trackRect = trackEl.getBoundingClientRect();
      const clickY = e.clientY - trackRect.top;
      const currentTrackHeight = trackRect.height;
      const currentScrollHeight = viewportRef.current.scrollHeight;
      const currentThumbHeight = currentScrollHeight > 0
        ? Math.min(currentTrackHeight, Math.max(28, (currentTrackHeight / currentScrollHeight) * currentTrackHeight))
        : currentTrackHeight;
      const currentMaxThumbTop = Math.max(1, currentTrackHeight - currentThumbHeight);
      const currentMaxScroll = Math.max(0, currentScrollHeight - currentTrackHeight);

      const targetThumbTop = clickY - currentThumbHeight / 2;
      const targetScroll = (targetThumbTop / currentMaxThumbTop) * currentMaxScroll;
      viewportRef.current.scrollTop = targetScroll;
    },
    []
  );

  // Update floating scroll bottom button visibility
  useEffect(() => {
    const isNearBottom = maxScroll - scrollTop < 150;
    setShowScrollBottom((prev) => (prev !== !isNearBottom ? !isNearBottom : prev));
  }, [maxScroll, scrollTop]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (chatTotalCount === 0) return;
    rowVirtualizer.scrollToIndex(chatTotalCount - 1, {
      align: 'end',
      behavior: 'smooth',
    });
  }, [chatTotalCount, rowVirtualizer]);

  // 11. Pending Jump tracking & handler via SQLite index lookup
  const [pendingJump, setPendingJump] = useState<{
    msgId: number;
    targetIdx: number;
    timestamp: number;
  } | null>(null);

  const handleJumpToMessage = useCallback(
    (targetMsgId: number) => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      setInternalHighlight(targetMsgId);
      setHighlightSession((prev) => prev + 1);

      const targetIdx = sqliteService.getMessageIndex(chat.id, targetMsgId);
      if (targetIdx >= 0) {
        // Pre-load wide chunk buffer around target index (±50)
        ensureBlocksLoaded(Math.max(0, targetIdx - 50), targetIdx + 50);
        setPendingJump({
          msgId: targetMsgId,
          targetIdx,
          timestamp: Date.now(),
        });
      }

      highlightTimeoutRef.current = setTimeout(() => {
        setInternalHighlight(null);
        if (onClearHighlight) {
          onClearHighlight();
        }
      }, 2600);
    },
    [chat.id, onClearHighlight, ensureBlocksLoaded]
  );

  // Clear highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // 12. Effect executing jump when message is loaded in messageCache
  useEffect(() => {
    if (!pendingJump || chatTotalCount === 0) return;

    const { targetIdx } = pendingJump;
    const cachedMsg = messageCache.get(targetIdx);

    // If not in cache yet, attempt to ensure chunk range is loaded
    if (!cachedMsg) {
      ensureBlocksLoaded(Math.max(0, targetIdx - 50), targetIdx + 50);
      const targetBlock = Math.max(0, Math.floor(targetIdx / 100));
      // If block was already loaded or chunk fetch produced no item, fallback scroll & clear pendingJump
      if (loadedBlocksRef.current.has(targetBlock)) {
        rowVirtualizerRef.current?.scrollToIndex(targetIdx, {
          align: 'center',
          behavior: 'smooth',
        });
        setPendingJump(null);
      }
      return;
    }

    // Target message is now available in cache!
    // 1st smooth scroll pass
    rowVirtualizerRef.current?.scrollToIndex(targetIdx, {
      align: 'center',
      behavior: 'smooth',
    });

    // 2nd correction pass using double requestAnimationFrame so real measured heights apply
    let rafId2: number;
    const rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        rowVirtualizerRef.current?.scrollToIndex(targetIdx, {
          align: 'center',
          behavior: 'smooth',
        });
        setPendingJump(null);
      });
    });

    return () => {
      cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [pendingJump, messageCache, chatTotalCount, ensureBlocksLoaded]);

  // 12b. Register position-getter function for exit position saving
  useEffect(() => {
    if (getPositionRef) {
      getPositionRef.current = () => {
        if (!chat?.id) return null;
        const items = rowVirtualizerRef.current?.getVirtualItems() || [];
        const topIdx = items.length > 0 ? items[0].index : 0;
        const currentScroll = viewportRef.current ? viewportRef.current.scrollTop : 0;
        return {
          chatId: chat.id,
          scrollOffset: currentScroll,
          topIndex: topIdx,
        };
      };
    }
    return () => {
      if (getPositionRef) {
        getPositionRef.current = null;
      }
    };
  }, [chat?.id, getPositionRef]);

  // 13. Track initial chat load to restore last position or scroll to bottom
  const hasInitializedChatRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasInitializedChatRef.current !== chat.id) {
      hasInitializedChatRef.current = chat.id;

      // Skip initial scroll if a jump or highlight target is active/pending
      if (!highlightTarget && !pendingJump && chatTotalCount > 0) {
        let restoredPos: { scrollOffset?: number; topIndex?: number } | null = null;
        const didSaveOnExit = localStorage.getItem('tav_did_save_on_exit') === 'true';

        if (didSaveOnExit) {
          try {
            const raw = localStorage.getItem('tav_last_exit_position');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && (parsed.chatId === chat.id || !parsed.chatId)) {
                if (
                  (typeof parsed.scrollOffset === 'number' && parsed.scrollOffset > 0) ||
                  (typeof parsed.topIndex === 'number' && parsed.topIndex > 0)
                ) {
                  restoredPos = parsed;
                }
              }
            }
          } catch {}
        }

        if (restoredPos && (typeof restoredPos.topIndex === 'number' || typeof restoredPos.scrollOffset === 'number')) {
          const rawTopIndex = restoredPos.topIndex ?? 0;
          const targetIdx = Math.min(Math.max(0, rawTopIndex), Math.max(0, chatTotalCount - 1));
          const targetOffset = restoredPos.scrollOffset ?? 0;

          // Pre-load chunk buffer around target index
          ensureBlocksLoaded(Math.max(0, targetIdx - 30), targetIdx + 50);

          let rafId2: number;
          const rafId1 = requestAnimationFrame(() => {
            rafId2 = requestAnimationFrame(() => {
              if (targetOffset > 0 && viewportRef.current) {
                viewportRef.current.scrollTop = targetOffset;
              } else if (targetIdx >= 0) {
                rowVirtualizerRef.current?.scrollToIndex(targetIdx, { align: 'start' });
              }
            });
          });

          return () => {
            cancelAnimationFrame(rafId1);
            if (rafId2) cancelAnimationFrame(rafId2);
          };
        } else {
          // Standard startup behavior: scroll to bottom
          requestAnimationFrame(() => {
            ensureBlocksLoaded(Math.max(0, chatTotalCount - 30), chatTotalCount);
            rowVirtualizerRef.current?.scrollToIndex(chatTotalCount - 1, {
              align: 'end',
              behavior: 'smooth',
            });
          });
        }
      }
    }
  }, [chat.id, chatTotalCount, ensureBlocksLoaded, highlightTarget, pendingJump]);

  // 14. Handle navigation jumps requested externally (guaranteed single-shot per timestamp)
  const lastProcessedHighlightRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      highlightTarget &&
      highlightTarget.timestamp !== lastProcessedHighlightRef.current &&
      chatTotalCount > 0
    ) {
      lastProcessedHighlightRef.current = highlightTarget.timestamp;
      handleJumpToMessage(highlightTarget.msgId);
    }
  }, [highlightTarget?.msgId, highlightTarget?.timestamp, chatTotalCount, handleJumpToMessage]);

  const avatarStyle = getAvatarStyle(headerInfo.colorClass);

  return (
    <div
      id="telegram-chat-view"
      className="flex-1 flex h-full w-full bg-[var(--bg-app)] relative overflow-hidden"
    >
      {/* 7. Left Navigation Menu Area */}
      <div
        className={`glass-panel border-r border-[var(--border-subtle)] flex flex-col justify-between shrink-0 select-none z-20 sidebar-transition ${
          isLeftMenuExpanded ? 'w-48 sm:w-52 p-3' : 'w-14 sm:w-15 py-3 px-1.5'
        }`}
      >
        {/* Top: Header & Nav Links */}
        <div className="space-y-3">
          {/* Header Row */}
          <div className="flex items-center justify-between px-1 h-8">
            {isLeftMenuExpanded ? (
              <>
                <span className="font-bold text-xs text-[var(--text-main)] tracking-wider uppercase">
                  Menu
                </span>
                <button
                  onClick={() => setIsLeftMenuExpanded(false)}
                  className="w-7 h-7 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center justify-center transition-colors cursor-pointer"
                  title="Collapse Menu"
                >
                  <Menu className="w-4 h-4 text-[var(--accent)]" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsLeftMenuExpanded(true)}
                className="w-full h-8 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center justify-center transition-colors cursor-pointer mx-auto"
                title="Expand Menu"
              >
                <Menu className="w-4.5 h-4.5 text-[var(--accent)]" />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {/* Chats Item */}
            <button
              onClick={() => setIsChatsListOpen((prev) => !prev)}
              className={`w-full flex items-center rounded-xl transition-all duration-150 cursor-pointer btn-press ${
                isChatsListOpen
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'
              } ${
                isLeftMenuExpanded ? 'gap-3 px-3 py-2.5 text-xs font-semibold' : 'justify-center p-2.5'
              }`}
              title="Chats"
            >
              <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
              {isLeftMenuExpanded && (
                <div className="flex-1 flex items-center justify-between truncate text-left">
                  <span>Chats</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-solid)] px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)]">
                    {chats.length || 1}
                  </span>
                </div>
              )}
            </button>

            {/* Search Item */}
            <button
              onClick={onOpenSearch}
              className={`w-full flex items-center rounded-xl transition-all duration-150 cursor-pointer btn-press text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] ${
                isLeftMenuExpanded ? 'gap-3 px-3 py-2.5 text-xs font-semibold' : 'justify-center p-2.5'
              }`}
              title="Search (Ctrl+F)"
            >
              <Search className="w-4 h-4 text-amber-500 shrink-0" />
              {isLeftMenuExpanded && <span>Search</span>}
            </button>

            {/* Media Item (Expands downward on click with smooth animation) */}
            <div className="flex flex-col">
              <button
                onClick={() => {
                  if (!isLeftMenuExpanded) {
                    setIsLeftMenuExpanded(true);
                    setIsMediaMenuExpanded(true);
                    setIsSettingsExpanded(false);
                  } else {
                    setIsMediaMenuExpanded((prev) => !prev);
                    if (!isMediaMenuExpanded) setIsSettingsExpanded(false);
                  }
                }}
                className={`w-full flex items-center rounded-xl transition-all duration-150 cursor-pointer btn-press ${
                  isMediaMenuExpanded
                    ? 'bg-blue-500/10 text-blue-500 font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'
                } ${
                  isLeftMenuExpanded ? 'gap-3 px-3 py-2.5 text-xs font-semibold' : 'justify-center p-2.5'
                }`}
                title="Media Gallery & Files"
              >
                <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                {isLeftMenuExpanded && (
                  <div className="flex-1 flex items-center justify-between text-left truncate">
                    <span>Media</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 text-[var(--text-muted)] ${
                        isMediaMenuExpanded ? 'rotate-180 text-blue-500' : ''
                      }`}
                    />
                  </div>
                )}
              </button>

              {/* Downward expanded media categories */}
              {isMediaMenuExpanded && isLeftMenuExpanded && (
                <div className="mt-1 pl-3 pr-1 py-1 space-y-0.5 animate-expand-down border-l-2 border-blue-500/30 ml-3.5">
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('photos')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <ImageIcon className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>Photos</span>
                  </button>
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('videos')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Film className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span>Videos</span>
                  </button>
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('music')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Music2 className="w-3 h-3 text-purple-500 shrink-0" />
                    <span>Music</span>
                  </button>
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('files')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <FileText className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Files</span>
                  </button>
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('links')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Link2 className="w-3 h-3 text-teal-500 shrink-0" />
                    <span>Links</span>
                  </button>
                  <button
                    onClick={() => onOpenMediaCategory && onOpenMediaCategory('gifs')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-pink-500 shrink-0" />
                    <span>GIFs</span>
                  </button>
                </div>
              )}
            </div>

            {/* Settings & Data Management (Expands downward on click) */}
            <div className="flex flex-col">
              <button
                onClick={() => {
                  if (!isLeftMenuExpanded) {
                    setIsLeftMenuExpanded(true);
                    setIsSettingsExpanded(true);
                    setIsMediaMenuExpanded(false);
                  } else {
                    setIsSettingsExpanded((prev) => !prev);
                    if (!isSettingsExpanded) setIsMediaMenuExpanded(false);
                  }
                }}
                className={`w-full flex items-center rounded-xl transition-all duration-150 cursor-pointer btn-press ${
                  isSettingsExpanded
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'
                } ${
                  isLeftMenuExpanded ? 'gap-3 px-3 py-2.5 text-xs font-semibold' : 'justify-center p-2.5'
                }`}
                title="Settings & Data Management"
              >
                <Sliders className="w-4 h-4 text-emerald-500 shrink-0" />
                {isLeftMenuExpanded && (
                  <div className="flex-1 flex items-center justify-between text-left truncate">
                    <span>Settings & Data</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 text-[var(--text-muted)] ${
                        isSettingsExpanded ? 'rotate-180 text-[var(--accent)]' : ''
                      }`}
                    />
                  </div>
                )}
              </button>

              {/* Downward expanded categories (originates from button, Apple fluid motion) */}
              {isSettingsExpanded && isLeftMenuExpanded && (
                <div className="mt-1 pl-3 pr-1 py-1 space-y-0.5 animate-expand-down border-l-2 border-[var(--accent-border)] ml-3.5">
                  <button
                    onClick={() => onOpenDatabase('chat')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>Chat Settings</span>
                  </button>
                  <button
                    onClick={() => onOpenDatabase('data')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Database className="w-3 h-3 text-purple-500 shrink-0" />
                    <span>Data & Storage</span>
                  </button>
                  <button
                    onClick={() => onOpenDatabase('appearance')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Palette className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>Appearance</span>
                  </button>
                  <button
                    onClick={() => onOpenDatabase('privacy')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3 text-teal-500 shrink-0" />
                    <span>Privacy</span>
                  </button>
                  <button
                    onClick={() => onOpenDatabase('about')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  >
                    <Info className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>About</span>
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Bottom indicator */}
        {isLeftMenuExpanded && (
          <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex items-center justify-between font-mono">
            <span>Offline</span>
            <span>v{APP_INFO.version}</span>
          </div>
        )}
      </div>

      {/* Floating Chats Selector Drawer / Popover when "Chats" clicked */}
      {isChatsListOpen && (
        <div
          className={`absolute top-12 ${
            isLeftMenuExpanded ? 'left-56' : 'left-20'
          } w-72 glass-modal rounded-2xl z-30 shadow-2xl p-3 border border-[var(--border-subtle)] animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)] px-1">
            <span className="font-bold text-xs text-[var(--text-main)]">Chats in Archive</span>
            <button
              onClick={() => setIsChatsListOpen(false)}
              className="w-6 h-6 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {chats.length > 0 ? (
              chats.map((c) => {
                const isCurrent = c.id === chat.id;
                const cAvatarStyle = getAvatarStyle(c.colorClass || 'blue');
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (onSelectChat) onSelectChat(c);
                      setIsChatsListOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center gap-2.5 transition-colors cursor-pointer btn-press ${
                      isCurrent
                        ? 'bg-[var(--accent-soft)] text-[var(--text-main)] border border-[var(--accent-border)]'
                        : 'hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs"
                      style={cAvatarStyle}
                    >
                      {c.initials || c.title.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-[var(--text-main)] truncate">
                        {c.title}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
                        {c.totalMessages.toLocaleString()} msgs
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-2 text-xs text-[var(--text-muted)] text-center">
                1 active chat loaded
              </div>
            )}
          </div>

          <div className="pt-2 mt-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => {
                setIsChatsListOpen(false);
                onOpenImport();
              }}
              className="w-full py-1.5 px-2.5 rounded-xl bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-main)] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-[var(--border-card)]"
            >
              <FolderUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Change / Relink Archive</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Floating Top Information Bar (Unified Floating Header with Integrated Date Indicator) */}
        <div className="absolute top-3 inset-x-3 sm:top-4 sm:inset-x-6 z-20 pointer-events-none">
          <div className="h-[52px] sm:h-14 glass-modal rounded-2xl sm:rounded-3xl px-3.5 sm:px-5 flex items-center justify-between gap-2.5 shadow-xl shadow-black/8 dark:shadow-black/50 border border-[var(--border-subtle)] dark:border-white/10 pointer-events-auto animate-floating-header transition-all duration-200">
            {/* Left: Chat info */}
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl sm:rounded-2xl flex items-center justify-center font-bold text-xs shadow-xs shrink-0 border border-black/5 dark:border-white/10 transition-transform hover:scale-105"
                style={avatarStyle}
              >
                {headerInfo.initials}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[var(--text-main)] truncate leading-tight tracking-tight">
                  {headerInfo.title}
                </h2>
                <p className="text-[11px] text-[var(--text-muted)] truncate font-mono tabular-nums">
                  {chatTotalCount.toLocaleString()} messages
                </p>
              </div>
            </div>

            {/* Right Group: Integrated Date Indicator + Refresh UI + Search Action */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Integrated Floating Date Indicator */}
              {activeDateInfo && (
                <button
                  onClick={toggleDateBubble}
                  className={`group flex items-center justify-center rounded-full bg-[var(--bg-surface-card)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-card)] dark:border-white/10 shadow-xs cursor-pointer active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none overflow-hidden ${
                    isDateBubbleExpanded
                      ? 'h-8 sm:h-8.5 px-3.5 ring-2 ring-[var(--accent)]/30 bg-[var(--accent-soft)]/30'
                      : 'w-8 h-8 sm:w-8.5 sm:h-8.5 hover:scale-105'
                  }`}
                  title={
                    isDateBubbleExpanded
                      ? 'Click to collapse date'
                      : `Messages from ${activeDateInfo.fullDate} (Click to expand)`
                  }
                  aria-label={
                    isDateBubbleExpanded
                      ? activeDateInfo.fullDate
                      : `Day ${activeDateInfo.dayNum}, click for full date`
                  }
                >
                  {isDateBubbleExpanded ? (
                    <div className="flex items-center gap-2 whitespace-nowrap animate-in fade-in duration-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text-main)] tracking-tight">
                        {activeDateInfo.fullDate}
                      </span>
                    </div>
                  ) : (
                    <span className="font-bold text-xs text-[var(--text-main)] font-mono tabular-nums tracking-tight">
                      {activeDateInfo.dayNum}
                    </span>
                  )}
                </button>
              )}

              {/* Quick Search trigger in header */}
              <button
                onClick={onOpenSearch}
                className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl sm:rounded-2xl hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
                title="Search in this chat (Ctrl+F)"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Message Stream Viewport Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div
            ref={viewportRef}
            tabIndex={0}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-auto px-2 sm:px-6 relative outline-none select-text [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chatTotalCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-[var(--text-muted)] pt-24">
                <p className="text-[var(--text-main)] font-semibold mb-1 text-sm">No messages in this chat</p>
                <p>Import an HTML export file to populate this history.</p>
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const msg = messageCache.get(virtualItem.index);
                  if (!msg) {
                    // Lightweight skeleton while chunk buffer arrives
                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualItem.start}px)`,
                          height: `${virtualItem.size || 50}px`,
                        }}
                        className="flex items-center px-4 py-2 opacity-25"
                      >
                        <div className="w-8 h-8 rounded-full bg-[var(--text-muted)]/20 mr-2" />
                        <div className="h-6 bg-[var(--text-muted)]/20 rounded-xl w-48" />
                      </div>
                    );
                  }

                  const isSelf =
                    perspectiveIdentity && perspectiveIdentity !== OBSERVER_IDENTITY
                      ? msg.senderName === perspectiveIdentity
                      : false;
                  const isHighlighted = internalHighlight === msg.id;

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <MessageBubble
                        key={`${msg.id}-${isHighlighted ? highlightSession : 'plain'}`}
                        message={msg}
                        isSelf={isSelf}
                        isHighlighted={isHighlighted}
                        onJumpToReply={handleJumpToMessage}
                        onOpenMedia={onOpenMedia}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom Scrollbar Layer */}
          {maxScroll > 0 && (
            <div
              ref={trackRef}
              onPointerDown={handleTrackPointerDown}
              className="absolute top-0 right-1 bottom-0 w-3 z-30 cursor-pointer select-none group"
              title="Scrollbar"
            >
              <div
                onPointerDown={handleThumbPointerDown}
                style={{
                  height: `${thumbHeight}px`,
                  transform: `translateY(${thumbTop}px)`,
                }}
                className={`w-1.5 rounded-full mx-auto transition-all duration-150 cursor-grab active:cursor-grabbing ${
                  isDraggingThumb
                    ? 'bg-[var(--accent)] w-2'
                    : 'bg-black/20 dark:bg-white/20 group-hover:bg-[var(--accent)]/60'
                }`}
              />
            </div>
          )}
        </div>

      {/* Scroll to Bottom Floating Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-16 right-6 w-10 h-10 rounded-2xl glass-panel text-[var(--text-main)] shadow-xl hover:scale-105 active:scale-95 transition-all duration-150 z-20 flex items-center justify-center border border-[var(--border-subtle)] cursor-pointer"
          title="Scroll to latest messages"
        >
          <ArrowDown className="w-4 h-4 text-[var(--accent)]" />
        </button>
      )}

      {/* Bottom Bar: Read-Only Archive Watermark */}
      <div className="h-11 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-5 flex items-center justify-between text-xs text-[var(--text-muted)] select-none shrink-0">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="font-medium text-[11px]">Telegram Archive Offline Viewer — Read-only browsing mode</span>
        </div>
      </div>
      </div>
    </div>
  );
};
