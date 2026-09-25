import React from 'react';
import { AppLogo } from './AppLogo';
import { ShieldCheck, Database, Search, ArrowRight, Zap, Eye, FolderKanban } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto select-none animate-in fade-in duration-300">
      {/* Background Ambient Glow FX */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/10 via-purple-500/10 to-indigo-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* Main Glassmorphic Welcome Card */}
      <div className="relative z-10 glass-panel max-w-lg w-full rounded-3xl p-8 sm:p-10 border border-[var(--border-card)] shadow-2xl flex flex-col items-center text-center backdrop-blur-xl">
        {/* Logo Section */}
        <div className="mb-3">
          <AppLogo className="mb-2" />
        </div>

        {/* Animated Welcome Message */}
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
            Welcome to Telegram Archive Viewer
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
            Your private, offline companion for searching, viewing, and organizing local Telegram chat exports.
          </p>
        </div>

        {/* Highlight Badges */}
        <div className="grid grid-cols-2 gap-3 w-full mb-8 text-left">
          <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] flex items-start gap-3 transition-transform hover:scale-[1.02]">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-main)]">100% Offline</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                Zero network requests. All data remains on your local machine.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] flex items-start gap-3 transition-transform hover:scale-[1.02]">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0 mt-0.5">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-main)]">SQLite Powered</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                High-performance search and instant indexed chat loading.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] flex items-start gap-3 transition-transform hover:scale-[1.02]">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0 mt-0.5">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-main)]">Deep Search</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                Instant full-text indexing for messages, media & dates.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] flex items-start gap-3 transition-transform hover:scale-[1.02]">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-main)]">Media Browser</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                Inline photos, videos, stickers, voice notes & files.
              </div>
            </div>
          </div>
        </div>

        {/* Get Started Primary Action Button */}
        <button
          onClick={onGetStarted}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-indigo-600 hover:from-[var(--accent-hover)] hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer"
        >
          <span>Get Started</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Footer Note */}
        <p className="text-[10px] text-[var(--text-muted)] mt-4">
          Ready to import your Telegram <code className="bg-[var(--bg-surface-hover)] px-1 py-0.5 rounded font-mono">messages.html</code> export folder.
        </p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
