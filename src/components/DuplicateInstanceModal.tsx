import React from 'react';
import { Layers, ArrowRight, ExternalLink } from 'lucide-react';
import { instanceService } from '../services/instanceService';
import { APP_INFO } from '../config/appinfo';

interface DuplicateInstanceModalProps {
  isOpen: boolean;
}

export const DuplicateInstanceModal: React.FC<DuplicateInstanceModalProps> = ({ isOpen }) => {
  if (!isOpen) return null;

  const handleFocusPrimary = () => {
    instanceService.focusPrimaryInstance();
  };

  const handleClaimPrimary = () => {
    instanceService.claimPrimaryInstance();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-lg flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-md glass-modal rounded-3xl p-8 shadow-2xl border border-[var(--border-subtle)] text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
        <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-5 text-[var(--accent)] shadow-md shadow-blue-500/15">
          <Layers className="w-7 h-7" />
        </div>

        <h2 className="text-base font-bold text-[var(--text-main)] mb-2 tracking-tight">
          Application Already Open
        </h2>

        <p className="text-[var(--text-secondary)] text-xs max-w-xs mb-6 leading-relaxed">
          {APP_INFO.name} is already running in another window. Single-instance protection is enabled to preserve local SQLite consistency.
        </p>

        <div className="w-full space-y-2.5">
          <button
            onClick={handleFocusPrimary}
            className="w-full py-2.5 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <span>Focus Active Window</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleClaimPrimary}
            className="w-full py-2.5 px-4 bg-[var(--bg-surface-solid)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <span>Use This Window Instead</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] w-full text-[11px] text-[var(--text-muted)]">
          Single-Instance Protection Active
        </div>
      </div>
    </div>
  );
};

export default DuplicateInstanceModal;
