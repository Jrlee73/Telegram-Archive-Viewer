import React, { useState, useMemo, useEffect } from 'react';
import { TelegramMessage, TelegramChat } from '../types';
import { sqliteService } from '../services/sqliteService';
import {
  Search,
  X,
  CornerDownRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronDown,
} from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: TelegramChat[];
  activeChatId: string;
  onJumpToMessage: (chatId: string, msgId: number) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface ChatDateResult {
  chat: TelegramChat;
  messages: TelegramMessage[];
  hasMore: boolean;
  offset: number;
  isLoadingMore?: boolean;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onJumpToMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'date'>('search');

  // ----------------------------------------------------
  // 1. KEYWORD SEARCH STATE & LOGIC (EXPLICIT TRIGGER)
  // ----------------------------------------------------
  const [searchInput, setSearchInput] = useState('');
  const [executedQuery, setExecutedQuery] = useState('');
  const [results, setResults] = useState<TelegramMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handlePerformSearch = (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchInput).trim();
    if (!term) {
      setExecutedQuery('');
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setExecutedQuery(term);

    setTimeout(() => {
      const matches = sqliteService.searchMessages(term, activeChatId, 2000);
      setResults(matches);
      setIsSearching(false);
    }, 20);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setExecutedQuery('');
    setResults([]);
    setIsSearching(false);
  };

  // Reset search when modal closes or active chat changes
  useEffect(() => {
    if (!isOpen) {
      setSearchInput('');
      setExecutedQuery('');
      setResults([]);
      setIsSearching(false);
    }
  }, [isOpen, activeChatId]);

  // ----------------------------------------------------
  // 2. DATE SEARCH STATE & LOGIC (INCREMENTAL LOAD)
  // ----------------------------------------------------
  const [dateDist, setDateDist] = useState<
    { dateKey: string; displayDate: string; count: number; year: number }[]
  >([]);

  useEffect(() => {
    if (isOpen) {
      const dist = sqliteService.getDateDistribution(activeChatId);
      setDateDist(dist);
    }
  }, [isOpen, activeChatId]);

  const {
    messagesByDateCount,
    latestDateKey,
    yearsWithData,
    dateKeyToDisplay,
  } = useMemo(() => {
    const map = new Map<string, number>();
    const displayMap = new Map<string, string>();
    const yearsSet = new Set<number>();

    for (const item of dateDist) {
      map.set(item.dateKey, item.count);
      displayMap.set(item.dateKey, item.displayDate);
      yearsSet.add(item.year);
    }

    const sortedKeys = Array.from(map.keys()).sort();
    return {
      messagesByDateCount: map,
      latestDateKey: sortedKeys[sortedKeys.length - 1] || '',
      yearsWithData: Array.from(yearsSet).sort((a, b) => a - b),
      dateKeyToDisplay: displayMap,
    };
  }, [dateDist]);

  // Calendar Picker State
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth() + 1);

  // Selected Date & Optional Date Filter Keyword
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateFilterQuery, setDateFilterQuery] = useState<string>('');

  // Results map grouped by chatId
  const [chatResultsMap, setChatResultsMap] = useState<{ [chatId: string]: ChatDateResult }>({});

  // Synchronize viewYear/viewMonth and default selected date to latest archive date
  useEffect(() => {
    if (latestDateKey && !selectedDate) {
      const [y, m] = latestDateKey.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m);
      setSelectedDate(latestDateKey);
    }
  }, [latestDateKey]);

  // Initial load for selected date: Fetch first 5 preview messages per matching chat
  useEffect(() => {
    if (!isOpen || activeTab !== 'date' || !selectedDate) {
      setChatResultsMap({});
      return;
    }

    let matchingChatIds = sqliteService.getMatchingChatIdsForDate(selectedDate, dateFilterQuery);

    if (activeChatId && matchingChatIds.includes(activeChatId)) {
      matchingChatIds = [
        activeChatId,
        ...matchingChatIds.filter((id) => id !== activeChatId),
      ];
    }

    const newResults: { [chatId: string]: ChatDateResult } = {};

    for (const cid of matchingChatIds) {
      const { messages, hasMore } = sqliteService.getMessagesByDate(
        selectedDate,
        cid,
        dateFilterQuery,
        0,
        6
      );

      const chatObj = chats.find((c) => c.id === cid) || {
        id: cid,
        title: cid === activeChatId ? 'Active Chat' : `Chat ${cid}`,
        chatType: 'personal',
        totalMessages: 0,
        initials: 'TC',
        colorClass: 'userpic1',
      };

      newResults[cid] = {
        chat: chatObj,
        messages,
        hasMore,
        offset: messages.length,
      };
    }

    setChatResultsMap(newResults);
  }, [isOpen, activeTab, selectedDate, dateFilterQuery, activeChatId, chats]);

  // Load next 5 messages for a specific chat
  const handleLoadMoreForChat = (chatId: string) => {
    const existing = chatResultsMap[chatId];
    if (!existing || !existing.hasMore) return;

    setChatResultsMap((prev) => ({
      ...prev,
      [chatId]: { ...prev[chatId], isLoadingMore: true },
    }));

    const currentOffset = existing.offset;
    const { messages: nextBatch, hasMore: nextHasMore } = sqliteService.getMessagesByDate(
      selectedDate,
      chatId,
      dateFilterQuery,
      currentOffset,
      6
    );

    setChatResultsMap((prev) => {
      const item = prev[chatId];
      if (!item) return prev;
      return {
        ...prev,
        [chatId]: {
          ...item,
          messages: [...item.messages, ...nextBatch],
          hasMore: nextHasMore,
          offset: item.offset + nextBatch.length,
          isLoadingMore: false,
        },
      };
    });
  };

  // Calendar month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((prev) => prev - 1);
      setViewMonth(12);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((prev) => prev + 1);
      setViewMonth(1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleDayClick = (clickedDateKey: string) => {
    setSelectedDate(clickedDateKey);
  };

  // Compute month days grid
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: {
      dayNumber: number;
      dateKey: string;
      isCurrentMonth: boolean;
      hasMessages: boolean;
      messageCount: number;
    }[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        dayNumber: 0,
        dateKey: '',
        isCurrentMonth: false,
        hasMessages: false,
        messageCount: 0,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = messagesByDateCount.get(dateKey) || 0;
      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: true,
        hasMessages: count > 0,
        messageCount: count,
      });
    }

    return days;
  }, [viewYear, viewMonth, messagesByDateCount]);

  if (!isOpen) return null;

  const highlightMatch = (text: string, term: string) => {
    if (!term.trim()) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark
          key={i}
          className="bg-amber-500/25 text-amber-500 dark:text-amber-400 font-semibold rounded px-1"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const totalChatMsgs = sqliteService.getMessageCount(activeChatId);
  const matchingChatEntries = Object.values(chatResultsMap);

  return (
    <div
      id="fts-search-modal"
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none"
    >
      <div className="w-full max-w-4xl glass-modal rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-[var(--border-subtle)]">
        {/* Header with Search & Tab Switch */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0 bg-[var(--bg-surface-card)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-xs shrink-0">
              {activeTab === 'search' ? (
                <Search className="w-5 h-5" />
              ) : (
                <Calendar className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                {activeTab === 'search' ? 'Search Messages' : 'Date Navigation & Calendar'}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {activeTab === 'search'
                  ? 'Query archive messages, senders, and media via SQLite'
                  : 'Select any date on the calendar to view messages incrementally'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Mode Tabs */}
            <div className="flex rounded-xl bg-[var(--bg-surface-hover)] p-1 border border-[var(--border-subtle)] text-xs">
              <button
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all duration-150 cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-[var(--bg-surface-solid)] text-[var(--text-main)] shadow-xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Text Search</span>
              </button>
              <button
                onClick={() => setActiveTab('date')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all duration-150 cursor-pointer ${
                  activeTab === 'date'
                    ? 'bg-[var(--bg-surface-solid)] text-[var(--text-main)] shadow-xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Calendar</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Text Search */}
        {activeTab === 'search' && (
          <>
            <div className="p-3.5 bg-[var(--bg-surface-solid)] border-b border-[var(--border-subtle)] flex items-center gap-2.5 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePerformSearch();
                }}
                className="flex-1 flex items-center gap-2.5"
              >
                <div className="flex-1 relative">
                  <input
                    id="fts-search-input"
                    type="text"
                    autoFocus
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search messages, senders, attachments..."
                    className="w-full bg-[var(--bg-surface-card)] text-[var(--text-main)] text-sm pl-4 pr-9 py-2.5 rounded-xl border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:outline-none placeholder-[var(--text-muted)] transition-colors"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-3 top-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  id="fts-search-submit-btn"
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/15 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </button>
              </form>

              <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums whitespace-nowrap px-2">
                {isSearching
                  ? 'Searching SQLite...'
                  : executedQuery
                  ? `${results.length} found`
                  : `${totalChatMsgs.toLocaleString()} total`}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] p-2 sm:p-3">
              {!executedQuery ? (
                <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                  <Search className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                  <p className="font-semibold text-sm text-[var(--text-main)]">Full-Text Search</p>
                  <p className="mt-1 text-xs">
                    Type a keyword or phrase and press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-main)] font-mono text-[10px] border border-[var(--border-subtle)]">Enter</kbd> or click <span className="text-[var(--accent)] font-medium">Search</span> to query your archive.
                  </p>
                </div>
              ) : results.length === 0 ? (
                <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                  No messages matched &ldquo;{executedQuery}&rdquo;
                </div>
              ) : (
                results.map((res) => {
                  const chat = chats.find((c) => c.id === res.chatId);
                  return (
                    <div
                      key={res.id}
                      id={`search-result-${res.id}`}
                      onClick={() => {
                        onJumpToMessage(res.chatId, res.id);
                        onClose();
                      }}
                      className="p-3.5 hover:bg-[var(--bg-surface-hover)] rounded-xl cursor-pointer transition-all duration-150 group flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] font-mono">
                            {chat?.title || 'Chat'}
                          </span>
                          <span className="text-xs font-semibold text-[var(--text-main)]">
                            {res.senderName}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                            {res.timeText} ({res.dateDay})
                          </span>
                        </div>

                        <div className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {highlightMatch(
                            res.textContent ||
                              `[Attachment: ${res.media?.title || res.media?.type}]`,
                            executedQuery
                          )}
                        </div>
                      </div>

                      <div className="text-[var(--accent)] group-hover:translate-x-1 transition-transform shrink-0 pt-1 opacity-70 group-hover:opacity-100">
                        <CornerDownRight className="w-4 h-4" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Tab 2: Date Picker with Incremental Loading */}
        {activeTab === 'date' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
            {/* Left Pane: Visual Calendar Picker */}
            <div className="w-full md:w-80 lg:w-[340px] p-4 flex flex-col shrink-0 overflow-y-auto bg-[var(--bg-surface-card)]">
              {/* Calendar Month & Year Controls */}
              <div className="bg-[var(--bg-surface-solid)] rounded-2xl p-3 border border-[var(--border-subtle)] mb-3 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                    title="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1 text-xs font-semibold text-[var(--text-main)]">
                    <select
                      value={viewMonth}
                      onChange={(e) => setViewMonth(Number(e.target.value))}
                      className="bg-transparent text-[var(--text-main)] text-xs font-semibold hover:bg-[var(--bg-surface-hover)] rounded-lg px-2 py-1 cursor-pointer outline-none transition-colors"
                    >
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={i + 1} className="bg-[var(--bg-surface-solid)] text-[var(--text-main)]">
                          {name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={viewYear}
                      onChange={(e) => setViewYear(Number(e.target.value))}
                      className="bg-transparent text-[var(--text-main)] text-xs font-semibold hover:bg-[var(--bg-surface-hover)] rounded-lg px-2 py-1 cursor-pointer outline-none transition-colors"
                    >
                      {yearsWithData.length > 0 ? (
                        yearsWithData.map((y) => (
                          <option key={y} value={y} className="bg-[var(--bg-surface-solid)] text-[var(--text-main)]">
                            {y}
                          </option>
                        ))
                      ) : (
                        <option value={viewYear} className="bg-[var(--bg-surface-solid)] text-[var(--text-main)]">
                          {viewYear}
                        </option>
                      )}
                    </select>
                  </div>

                  <button
                    onClick={handleNextMonth}
                    className="p-1 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                    title="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day of week headers */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[var(--text-muted)] mb-1">
                  {WEEKDAY_NAMES.map((name) => (
                    <div key={name} className="py-1">
                      {name}
                    </div>
                  ))}
                </div>

                {/* Calendar Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {calendarDays.map((cell, idx) => {
                    if (!cell.isCurrentMonth) {
                      return <div key={`empty-${idx}`} className="h-8" />;
                    }

                    const isSelected = cell.dateKey === selectedDate;

                    let bgClass = 'hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]';

                    if (isSelected) {
                      bgClass = 'bg-[var(--accent)] text-white font-bold shadow-xs';
                    }

                    return (
                      <button
                        key={cell.dateKey}
                        onClick={() => handleDayClick(cell.dateKey)}
                        className={`h-8 relative flex flex-col items-center justify-center transition-all duration-150 cursor-pointer select-none text-xs rounded-xl font-mono ${bgClass}`}
                        title={
                          cell.hasMessages
                            ? `${cell.dateKey}: ${cell.messageCount} messages`
                            : `${cell.dateKey}: No messages`
                        }
                      >
                        <span className="leading-none">{cell.dayNumber}</span>
                        {cell.hasMessages && (
                          <span
                            className={`w-1 h-1 rounded-full mt-0.5 ${
                              isSelected ? 'bg-white' : 'bg-[var(--accent)]'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Date Badge */}
              <div className="p-3 bg-[var(--bg-surface-solid)] rounded-2xl border border-[var(--border-subtle)] space-y-1 text-xs">
                <span className="text-[var(--text-muted)] text-[10px] uppercase font-semibold tracking-wider block">
                  Selected Date
                </span>
                <div className="text-[var(--text-main)] font-bold text-xs">
                  {selectedDate ? (
                    dateKeyToDisplay.get(selectedDate) || selectedDate
                  ) : (
                    <span className="text-[var(--text-muted)]">Select a date on calendar</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Pane: Incremental Message Previews per Chat */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-surface-solid)]">
              {/* Optional Date Filter Bar */}
              <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-card)] flex items-center gap-2 shrink-0">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={dateFilterQuery}
                    onChange={(e) => setDateFilterQuery(e.target.value)}
                    placeholder="Filter messages on selected date..."
                    className="w-full bg-[var(--bg-surface-solid)] text-[var(--text-main)] text-xs px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:outline-none placeholder-[var(--text-muted)] transition-colors"
                  />
                  {dateFilterQuery && (
                    <button
                      onClick={() => setDateFilterQuery('')}
                      className="absolute right-3 top-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Results per Chat */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
                {matchingChatEntries.length === 0 ? (
                  <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-sm text-[var(--text-main)]">No Messages Found</p>
                    <p className="mt-1">
                      {dateFilterQuery
                        ? `No messages on ${selectedDate} matched "${dateFilterQuery}".`
                        : 'No messages were recorded on the selected date. Pick another date on the calendar.'}
                    </p>
                  </div>
                ) : (
                  matchingChatEntries.map((result) => (
                    <div
                      key={result.chat.id}
                      className="bg-[var(--bg-surface-card)] rounded-2xl p-3.5 border border-[var(--border-subtle)] space-y-2.5 shadow-2xs"
                    >
                      {/* Chat Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                        <span className="text-xs font-bold text-[var(--accent)]">
                          {result.chat.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
                          {result.messages.length} loaded
                        </span>
                      </div>

                      {/* Preview Messages */}
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {result.messages.map((msg) => (
                          <div
                            key={msg.id}
                            onClick={() => {
                              onJumpToMessage(msg.chatId, msg.id);
                              onClose();
                            }}
                            className="py-2.5 px-2 hover:bg-[var(--bg-surface-hover)] rounded-xl cursor-pointer transition-colors group flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-semibold text-[var(--text-main)]">
                                  {msg.senderName || 'Service'}
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 font-mono">
                                  <Clock className="w-2.5 h-2.5" />
                                  {msg.timeText} ({msg.dateDay})
                                </span>
                              </div>
                              <div className="text-[var(--text-secondary)] line-clamp-2 leading-relaxed text-[11px]">
                                {highlightMatch(
                                  msg.textContent ||
                                    `[Attachment: ${msg.media?.title || msg.media?.type}]`,
                                  dateFilterQuery
                                )}
                              </div>
                            </div>

                            <div className="text-[var(--accent)] group-hover:translate-x-1 transition-transform shrink-0 pt-1 opacity-70 group-hover:opacity-100">
                              <CornerDownRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* More (5) Incremental Loading Button */}
                      {result.hasMore && (
                        <div className="pt-1 text-center">
                          <button
                            onClick={() => handleLoadMoreForChat(result.chat.id)}
                            disabled={result.isLoadingMore}
                            className="px-3.5 py-1.5 bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] text-[11px] font-semibold rounded-xl transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                          >
                            <ChevronDown className="w-3 h-3" />
                            <span>{result.isLoadingMore ? 'Loading...' : 'More (5)'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 bg-[var(--bg-surface-card)] border-t border-[var(--border-subtle)] flex justify-between items-center text-[11px] text-[var(--text-muted)] px-5 shrink-0">
          <span>Click any message preview to jump directly to it in the chat timeline.</span>
        </div>
      </div>
    </div>
  );
};
