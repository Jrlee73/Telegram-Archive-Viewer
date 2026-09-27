import React, { useState } from 'react';
import { X, Trash2, Database, Image, Sliders, AlertTriangle, RotateCcw, Check, Sparkles } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';

export interface DataResetCategories {
  chatData: boolean;
  mediaCache: boolean;
  settingsPreferences: boolean;
}

interface DataResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteReset: (categories: DataResetCategories) => Promise<void>;
}

export const DataResetModal: React.FC<DataResetModalProps> = ({
  isOpen,
  onClose,
  onExecuteReset,
}) => {
  const [categories, setCategories] = useState<DataResetCategories>({
    chatData: true,
    mediaCache: true,
    settingsPreferences: false,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const isAllSelected = categories.chatData && categories.mediaCache && categories.settingsPreferences;
  const isNoneSelected = !categories.chatData && !categories.mediaCache && !categories.settingsPreferences;

  const handleToggle = (key: keyof DataResetCategories) => {
    setCategories((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setCategories({ chatData: false, mediaCache: false, settingsPreferences: false });
    } else {
      setCategories({ chatData: true, mediaCache: true, settingsPreferences: true });
    }
  };

  const handleConfirm = async () => {
    if (isNoneSelected) return;
    setIsDeleting(true);
    try {
      await onExecuteReset(categories);
      onClose();
    } catch (err) {
      console.error('Reset error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel max-w-md w-full rounded-3xl border border-[var(--border-card)] shadow-2xl overflow-hidden flex flex-col bg-[var(--bg-app)]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-card)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--text-main)]">Reset Local Storage</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Select data categories to remove</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Quick Select Header */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
              Categories Selection
            </span>
            <button
              onClick={handleSelectAll}
              className="text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isAllSelected ? 'Deselect All' : 'Select All (Complete Reset)'}</span>
            </button>
          </div>

          {/* Option 1: Chat Data */}
          <div
            onClick={() => handleToggle('chatData')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              categories.chatData
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-[var(--bg-surface-card)] border-[var(--border-card)] hover:border-[var(--border-subtle)]'
            }`}
          >
            <div className="flex items-start gap-3 pr-2">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  categories.chatData ? 'bg-rose-500/10 text-rose-500' : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'
                }`}
              >
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs text-[var(--text-main)]">1. Chat Data</div>
                <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                  Removes SQLite chat messages, chat list, contacts, and search indexes.
                </div>
              </div>
            </div>
            <ToggleSwitch
              checked={categories.chatData}
              onChange={() => handleToggle('chatData')}
              ariaLabel="Chat Data toggle"
            />
          </div>

          {/* Option 2: Media & Cache */}
          <div
            onClick={() => handleToggle('mediaCache')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              categories.mediaCache
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-[var(--bg-surface-card)] border-[var(--border-card)] hover:border-[var(--border-subtle)]'
            }`}
          >
            <div className="flex items-start gap-3 pr-2">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  categories.mediaCache ? 'bg-rose-500/10 text-rose-500' : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'
                }`}
              >
                <Image className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs text-[var(--text-main)]">2. Media & Cache</div>
                <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                  Clears IndexedDB media registry, cached photos/videos, stickers, and Blob URLs.
                </div>
              </div>
            </div>
            <ToggleSwitch
              checked={categories.mediaCache}
              onChange={() => handleToggle('mediaCache')}
              ariaLabel="Media & Cache toggle"
            />
          </div>

          {/* Option 3: Settings & Preferences */}
          <div
            onClick={() => handleToggle('settingsPreferences')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              categories.settingsPreferences
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-[var(--bg-surface-card)] border-[var(--border-card)] hover:border-[var(--border-subtle)]'
            }`}
          >
            <div className="flex items-start gap-3 pr-2">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  categories.settingsPreferences
                    ? 'bg-rose-500/10 text-rose-500'
                    : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'
                }`}
              >
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-xs text-[var(--text-main)]">3. Settings & Preferences</div>
                <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                  Resets application configuration, themes, chat display options, and passcode lock.
                </div>
              </div>
            </div>
            <ToggleSwitch
              checked={categories.settingsPreferences}
              onChange={() => handleToggle('settingsPreferences')}
              ariaLabel="Settings & Preferences toggle"
            />
          </div>

          {/* Notice banner depending on complete reset vs partial */}
          {isAllSelected ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <div className="font-bold">Complete Reset Selected</div>
                <div className="text-[11px] text-amber-500/90 leading-tight mt-0.5">
                  All data will be removed. The application will return to a true first-install state and the Welcome Screen will appear again.
                </div>
              </div>
            </div>
          ) : isNoneSelected ? (
            <div className="p-3 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs text-center">
              Please select at least one category to proceed with reset.
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Only selected data categories will be cleared. Original files on disk are untouched.</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-card)] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] text-xs font-semibold cursor-pointer border border-[var(--border-subtle)] transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isNoneSelected || isDeleting}
            className={`px-4 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 ${
              isAllSelected ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-rose-500 hover:bg-rose-600'
            }`}
          >
            {isDeleting ? (
              <span>Processing Reset...</span>
            ) : isAllSelected ? (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Complete Reset</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataResetModal;
