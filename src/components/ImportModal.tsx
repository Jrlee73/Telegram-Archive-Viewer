import React, { useState, useRef } from 'react';
import { parseTelegramHtml, isPotentialTelegramExport } from '../utils/htmlArchiveParser';
import { TelegramChat, TelegramMessage } from '../types';
import { sqliteService } from '../services/sqliteService';
import { mediaService } from '../services/mediaService';
import { FolderUp, CheckCircle2, X, FolderSearch, Database, AlertCircle, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface SkippedHtmlFile {
  name: string;
  relativePath?: string;
  reason: string;
  size?: number;
}

interface ImportSummaryData {
  chatsCount: number;
  totalMessages: number;
  chatTitle: string;
  allChatTitles: string[];
  mediaCount: number;
  mediaFoldersFound: string[];
  importedHtmlFilesCount: number;
  skippedHtmlFiles: SkippedHtmlFile[];
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (chats: TelegramChat[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const pendingImportActionRef = useRef<(() => Promise<void>) | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProgress(5);
    setLogs([`Scanning ${files.length} items from selected export root folder...`]);
    setImportSummary(null);

    const fileList = Array.from(files);

    // Extract root folder name
    let rootFolderName = 'Telegram Export';
    const firstPath = (fileList[0] as any).webkitRelativePath;
    if (firstPath) {
      const parts = firstPath.split(/[/\\]/);
      if (parts.length > 1) {
        rootFolderName = parts[0];
      }
    }

    // 1. Register media files into MediaService for relative path mapping
    const { registeredCount, categories } = mediaService.registerFiles(files, rootFolderName);

    // 2. Identify candidate HTML files
    const htmlFiles = fileList.filter(
      (f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')
    );

    // Sort HTML files naturally (messages.html, messages2.html, messages3.html...)
    htmlFiles.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Detect media directories present
    const mediaFolderNames = new Set<string>();
    const mediaDbRecords: { relPath: string; fileName: string; fileType: string; fileSize?: number }[] = [];

    fileList.forEach((f) => {
      const rawPath = (f as any).webkitRelativePath || f.name;
      const parts = rawPath.split(/[/\\]/);
      if (parts.length > 1) {
        mediaFolderNames.add(parts[parts.length - 2]);
        const relPath = parts.slice(1).join('/');
        mediaDbRecords.push({
          relPath,
          fileName: f.name,
          fileType: f.type || 'application/octet-stream',
          fileSize: f.size,
        });
      }
    });

    setLogs((prev) => [
      ...prev,
      `Detected ${htmlFiles.length} HTML file(s) and ${registeredCount} total assets.`,
      `Media breakdown: ${categories.photos} photos, ${categories.stickers} stickers, ${categories.videos} videos, ${categories.audio} audio/voice notes, ${categories.files} documents.`,
      mediaFolderNames.size > 0
        ? `Detected export directories: ${Array.from(mediaFolderNames).join(', ')}`
        : `Root export directory detected.`,
    ]);

    // 3. Initialize SQLite database
    await sqliteService.init();

    // Check if we can perform a fast media re-link
    const existingChats = sqliteService.getAllChats();
    const existingCount = existingChats.reduce(
      (acc, c) => acc + sqliteService.getMessageCount(c.id),
      0
    );
    const storedFolder = sqliteService.getSetting('export_folder_name');

    // If existing SQLite database already has this chat's messages and user is re-selecting folder
    if (existingCount > 0 && storedFolder === rootFolderName && htmlFiles.length > 0) {
      if (mediaDbRecords.length > 0) {
        sqliteService.insertMediaFiles(mediaDbRecords);
      }
      await sqliteService.persist();
      setProgress(100);
      setLogs((prev) => [
        ...prev,
        `✅ Media re-link complete: ${registeredCount} assets connected to SQLite archive (${existingCount.toLocaleString()} messages).`,
      ]);

      setImportSummary({
        chatsCount: existingChats.length,
        totalMessages: existingCount,
        chatTitle: existingChats[0]?.title || 'Exported Chat',
        allChatTitles: existingChats.map((c) => c.title),
        mediaCount: registeredCount,
        mediaFoldersFound: Array.from(mediaFolderNames),
        importedHtmlFilesCount: htmlFiles.length,
        skippedHtmlFiles: [],
      });
      setIsProcessing(false);
      onImportComplete(existingChats);
      return;
    }

    // Function to perform full clean import & SQLite indexing
    const executeFullImport = async () => {
      await sqliteService.clearAllData();
      sqliteService.setSetting('export_folder_name', rootFolderName);
      sqliteService.setSetting('last_import_time', new Date().toISOString());

      // Insert detected media files into SQLite
      if (mediaDbRecords.length > 0) {
        sqliteService.insertMediaFiles(mediaDbRecords);
      }

      interface ChatBucket {
        chat: TelegramChat;
        totalMessages: number;
        runningSeq: number;
        files: string[];
      }

      const chatsMap = new Map<string, ChatBucket>();
      const skippedHtmlFiles: SkippedHtmlFile[] = [];
      let totalMessagesIngested = 0;
      let importedHtmlFilesCount = 0;

      // 4. Ingest and parse HTML files in streaming batches
      const BATCH_SIZE = 5;
      for (let i = 0; i < htmlFiles.length; i += BATCH_SIZE) {
        const batch = htmlFiles.slice(i, i + BATCH_SIZE);
        for (const file of batch) {
          const currentIdx = htmlFiles.indexOf(file) + 1;
          const percent = Math.round((currentIdx / htmlFiles.length) * 85);
          setProgress(percent);

          const rawRelPath = (file as any).webkitRelativePath || file.name;

          try {
            const text = await file.text();

            // Step 1: Lightweight pre-check (fast-reject non-Telegram HTML attachments)
            if (!isPotentialTelegramExport(text)) {
              skippedHtmlFiles.push({
                name: file.name,
                relativePath: rawRelPath,
                reason: 'No valid Telegram messages detected',
                size: file.size,
              });
              setLogs((prev) => [
                ...prev,
                `⏭️ [Attachment] Skipped ${file.name}: No valid Telegram message structures detected (kept as attachment).`,
              ]);
              continue;
            }

            // Step 2: Attempt parsing with Telegram archive parser
            const parseResult = parseTelegramHtml(
              text,
              file.name,
              undefined,
              undefined,
              currentIdx,
              0
            );

            // Step 3: Validate message count
            if (!parseResult.isValidArchive || parseResult.messages.length === 0 || !parseResult.chat) {
              skippedHtmlFiles.push({
                name: file.name,
                relativePath: rawRelPath,
                reason: parseResult.reason || 'No valid Telegram messages detected',
                size: file.size,
              });
              setLogs((prev) => [
                ...prev,
                `⏭️ [Attachment] Skipped ${file.name}: 0 Telegram messages parsed (kept as attachment).`,
              ]);
              continue;
            }

            // Step 4: Valid Telegram archive confirmed! Add to chat bucket
            // Group multi-part files for the same chat
            let chatKey = parseResult.chat.id;
            const pathParts = rawRelPath.split(/[/\\]/);
            if (pathParts.length > 2 && pathParts[pathParts.length - 2].toLowerCase().startsWith('chat')) {
              chatKey = pathParts[pathParts.length - 2];
            }

            let bucket = chatsMap.get(chatKey);
            if (!bucket) {
              bucket = {
                chat: {
                  ...parseResult.chat,
                  id: chatKey,
                },
                totalMessages: 0,
                runningSeq: 0,
                files: [],
              };
              chatsMap.set(chatKey, bucket);
              sqliteService.insertChats([bucket.chat]);
            }

            // Adjust sequence numbers for this chat
            const adjustedMessages = parseResult.messages.map((m, idx) => ({
              ...m,
              chatId: chatKey,
              seq: bucket!.runningSeq + idx,
            }));

            bucket.runningSeq += adjustedMessages.length;
            bucket.totalMessages += adjustedMessages.length;
            bucket.files.push(file.name);

            // Update last message & date
            const validMsgs = adjustedMessages.filter((m) => m.msgType !== 'service');
            const lastMsg = validMsgs[validMsgs.length - 1] || adjustedMessages[adjustedMessages.length - 1];
            if (lastMsg) {
              bucket.chat.lastMessage = lastMsg.textContent || (lastMsg.media ? `[${lastMsg.media.type}]` : 'Chat archive');
              bucket.chat.lastDate = lastMsg.timeText || bucket.chat.lastDate;
            }
            bucket.chat.totalMessages = bucket.totalMessages;

            // Stream insert into SQLite
            sqliteService.insertMessages(adjustedMessages);
            totalMessagesIngested += adjustedMessages.length;
            importedHtmlFilesCount++;

            setLogs((prev) => [
              ...prev,
              `✅ Parsed ${file.name} ("${bucket!.chat.title}"): +${adjustedMessages.length.toLocaleString()} messages (total ${totalMessagesIngested.toLocaleString()})`,
            ]);
          } catch (err: any) {
            console.error(`Error parsing file ${file.name}:`, err);
            skippedHtmlFiles.push({
              name: file.name,
              relativePath: rawRelPath,
              reason: `Parser error: ${err?.message || 'Unknown error'}`,
              size: file.size,
            });
            setLogs((prev) => [...prev, `⚠️ Error parsing ${file.name}: ${err?.message || err}`]);
          }
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      // Clear old saved viewing positions so new archive opens fresh at the latest message
      try {
        localStorage.removeItem('tav_last_viewed_position');
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('tav_last_position_')) {
            localStorage.removeItem(key);
          }
        });
      } catch {}

      // Finalize chat metadata in SQLite
      if (chatsMap.size > 0) {
        const finalChats = Array.from(chatsMap.values()).map((b) => b.chat);
        sqliteService.insertChats(finalChats);
      }

      setProgress(95);
      setLogs((prev) => [...prev, 'Persisting SQLite database snapshot...']);

      // Persist full binary to IndexedDB
      await sqliteService.persist();

      const allChats = sqliteService.getAllChats();

      setProgress(100);
      setLogs((prev) => [
        ...prev,
        chatsMap.size > 0
          ? `✅ Import completed successfully: ${chatsMap.size} chat(s), ${totalMessagesIngested.toLocaleString()} messages stored and indexed in local SQLite.`
          : `⚠️ Import completed: 0 Telegram chat archives detected. ${skippedHtmlFiles.length} HTML files skipped as attachments.`,
      ]);

      setImportSummary({
        chatsCount: chatsMap.size,
        totalMessages: totalMessagesIngested,
        chatTitle: allChats[0]?.title || (chatsMap.size > 0 ? Array.from(chatsMap.values())[0].chat.title : 'No chat imported'),
        allChatTitles: allChats.map((c) => c.title),
        mediaCount: registeredCount,
        mediaFoldersFound: Array.from(mediaFolderNames),
        importedHtmlFilesCount,
        skippedHtmlFiles,
      });

      setIsProcessing(false);
      onImportComplete(allChats);
    };

    // If an existing archive exists and a different folder is selected, ask for confirmation first
    if (existingCount > 0 && storedFolder !== rootFolderName) {
      pendingImportActionRef.current = executeFullImport;
      setShowReplaceConfirm(true);
      return;
    }

    await executeFullImport();
  };

  const handleConfirmReplace = async () => {
    setShowReplaceConfirm(false);
    if (pendingImportActionRef.current) {
      const action = pendingImportActionRef.current;
      pendingImportActionRef.current = null;
      await action();
    }
  };

  const handleCancelReplace = () => {
    setShowReplaceConfirm(false);
    pendingImportActionRef.current = null;
    setIsProcessing(false);
    setProgress(0);
    setLogs([]);
  };

  const handleSelectFolderClick = async () => {
    if (window.electronAPI?.selectExportDirectory) {
      try {
        const selected = await window.electronAPI.selectExportDirectory();
        if (!selected) return;

        setIsProcessing(true);
        setProgress(2);
        setLogs([`Selected folder: ${selected.path}`, `Scanning files...`]);

        const filesInfo = await window.electronAPI.readDirectoryFiles(selected.path);
        setLogs((prev) => [...prev, `Found ${filesInfo.length} files in export folder.`]);

        const htmlCandidates = filesInfo.filter((f) => {
          const lower = f.name.toLowerCase();
          return lower.endsWith('.html') || lower.endsWith('.htm');
        });

        // Batch read HTML files concurrently with worker pool
        const htmlTextMap = new Map<string, string>();
        if (window.electronAPI.readMultipleFilesAsText) {
          const res = await window.electronAPI.readMultipleFilesAsText(htmlCandidates.map((f) => f.fullPath));
          for (const [k, v] of Object.entries(res)) {
            htmlTextMap.set(k, v);
          }
        } else {
          const CONCURRENCY = 8;
          for (let i = 0; i < htmlCandidates.length; i += CONCURRENCY) {
            const batch = htmlCandidates.slice(i, i + CONCURRENCY);
            await Promise.all(
              batch.map(async (f) => {
                try {
                  const text = await window.electronAPI!.readFileAsText(f.fullPath);
                  htmlTextMap.set(f.fullPath, text);
                } catch (err) {
                  console.warn('Failed reading file:', f.fullPath, err);
                }
              })
            );
          }
        }

        const fileObjects: File[] = filesInfo.map((f) => {
          const isHtml = f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm');
          const content = isHtml ? (htmlTextMap.get(f.fullPath) || '') : '';
          const fileObj = new File([content], f.name, {
            type: isHtml ? 'text/html' : 'application/octet-stream',
          });
          Object.defineProperty(fileObj, 'webkitRelativePath', {
            value: `${selected.name}/${f.relativePath}`,
          });
          return fileObj;
        });

        mediaService.setExportRootPath(selected.path, selected.name);
        sqliteService.setSetting('exportRootPath', selected.path);
        sqliteService.setSetting('exportRootName', selected.name);

        processFiles(fileObjects);
        return;
      } catch (err) {
        console.error('Electron folder selection error:', err);
      }
    }
    folderInputRef.current?.click();
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      id="import-archive-modal"
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none"
    >
      <div className="w-full max-w-xl glass-modal rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-[var(--border-subtle)]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-card)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-xs shrink-0">
              <FolderUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                Import Telegram Export Folder
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Recursively validates HTML archives and classifies attachments
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Drop area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-[var(--border-card)] hover:border-[var(--accent)] rounded-2xl p-8 text-center transition-all bg-[var(--bg-surface-card)] flex flex-col items-center justify-center relative group"
          >
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] mb-3 shadow-xs group-hover:scale-105 transition-transform">
              <FolderSearch className="w-7 h-7" />
            </div>
            <p className="text-xs font-bold text-[var(--text-main)]">
              Select or Drop the Telegram Export Folder
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 max-w-sm leading-relaxed">
              Point to your Telegram export directory containing <code className="text-[var(--text-main)] bg-[var(--bg-surface-hover)] px-1.5 py-0.5 rounded font-mono text-[10px] border border-[var(--border-subtle)]">messages.html</code>, <code className="text-[var(--text-main)] bg-[var(--bg-surface-hover)] px-1.5 py-0.5 rounded font-mono text-[10px] border border-[var(--border-subtle)]">photos/</code>, <code className="text-[var(--text-main)] bg-[var(--bg-surface-hover)] px-1.5 py-0.5 rounded font-mono text-[10px] border border-[var(--border-subtle)]">stickers/</code>.
            </p>

            <div className="flex items-center gap-2.5 mt-5">
              {/* Folder picker button */}
              <button
                type="button"
                onClick={handleSelectFolderClick}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer transition-all shadow-md shadow-blue-500/15 flex items-center gap-2 active:scale-95"
              >
                <FolderUp className="w-4 h-4" />
                <span>Select Export Folder</span>
              </button>

              {/* Individual HTML file picker as fallback */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-secondary)] hover:text-[var(--text-main)] text-xs font-semibold cursor-pointer transition-colors border border-[var(--border-subtle)] active:scale-95"
              >
                Choose HTML Files
              </button>
            </div>

            {/* Hidden directory picker */}
            <input
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              onChange={handleFolderSelect}
              className="hidden"
            />

            {/* Hidden HTML files picker */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".html,.htm"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="space-y-2 p-3.5 bg-[var(--bg-surface-card)] rounded-2xl border border-[var(--border-card)]">
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-2 font-medium text-[var(--text-main)]">
                  <Database className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
                  Validating & streaming messages into SQLite database...
                </span>
                <span className="font-mono text-[var(--text-main)] font-semibold">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[var(--bg-surface-hover)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-200 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Logs Terminal Box */}
          {logs.length > 0 && (
            <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-2xl p-4 font-mono text-[11px] text-[var(--text-secondary)] max-h-36 overflow-y-auto space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-tight">
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Import Summary Result */}
          {importSummary && (
            <div className="space-y-3 animate-in fade-in zoom-in-98 duration-200">
              <div
                className={`p-4 rounded-2xl border ${
                  importSummary.chatsCount > 0
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-amber-500/10 border-amber-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  {importSummary.chatsCount > 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                        Import Summary
                      </h3>
                      {importSummary.chatsCount > 0 && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full font-semibold">
                          Complete
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div className="bg-[var(--bg-surface-card)]/80 p-2.5 rounded-xl border border-[var(--border-subtle)]">
                        <span className="text-[10px] text-[var(--text-muted)] block font-medium">Telegram Chats</span>
                        <strong className="text-sm font-bold text-[var(--text-main)] font-mono">
                          {importSummary.chatsCount} chat{importSummary.chatsCount === 1 ? '' : 's'}
                        </strong>
                      </div>
                      <div className="bg-[var(--bg-surface-card)]/80 p-2.5 rounded-xl border border-[var(--border-subtle)]">
                        <span className="text-[10px] text-[var(--text-muted)] block font-medium">Messages Imported</span>
                        <strong className="text-sm font-bold text-emerald-500 font-mono">
                          {importSummary.totalMessages.toLocaleString()}
                        </strong>
                      </div>
                    </div>

                    {importSummary.chatsCount > 0 ? (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Chat <strong className="font-semibold text-[var(--text-main)]">&ldquo;{importSummary.chatTitle}&rdquo;</strong> loaded with{' '}
                        <strong className="font-mono text-[var(--text-main)]">{importSummary.mediaCount} media assets</strong> into SQLite.
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-400">
                        No valid Telegram conversation archives found. All scanned HTML files were identified as attachments or documents.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Skipped HTML Files Card */}
              {importSummary.skippedHtmlFiles.length > 0 && (
                <div className="p-3.5 bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                      <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                      <span>Skipped HTML files ({importSummary.skippedHtmlFiles.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSkippedDetails((prev) => !prev)}
                      className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-main)] bg-[var(--bg-surface-hover)] px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>{showSkippedDetails ? 'Hide list' : 'View files'}</span>
                      {showSkippedDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-app)] p-2.5 rounded-xl border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>Reason: No valid Telegram messages detected</span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-[var(--text-muted)] pl-3">
                      These files are kept as regular file attachments inside the exported data and will not create incorrect empty chats or pollute your conversation database.
                    </p>
                  </div>

                  {showSkippedDetails && (
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1 font-mono text-[10px] pt-1">
                      {importSummary.skippedHtmlFiles.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                        >
                          <div className="flex items-center gap-1.5 truncate min-w-0">
                            <span className="text-[var(--text-muted)]">•</span>
                            <span className="truncate text-[var(--text-main)] font-medium">{f.name}</span>
                            {f.relativePath && f.relativePath !== f.name && (
                              <span className="text-[9px] text-[var(--text-muted)] truncate hidden sm:inline">
                                ({f.relativePath})
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[9px] text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded font-sans font-medium">
                            Attachment
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[var(--bg-surface-card)] border-t border-[var(--border-subtle)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
          >
            {importSummary?.chatsCount && importSummary.chatsCount > 0 ? 'Open Chat' : 'Close'}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog on Archive Replacement */}
      {showReplaceConfirm && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-[var(--border-subtle)] shadow-2xl bg-[var(--bg-app)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-main)]">
                  Replace Existing Archive?
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Archive replacement confirmation
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This will replace your existing archive with the new export. Continue?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={handleCancelReplace}
                className="px-4 py-2 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] text-xs font-semibold cursor-pointer border border-[var(--border-subtle)] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer transition-all shadow-md active:scale-95"
              >
                Confirm &amp; Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
