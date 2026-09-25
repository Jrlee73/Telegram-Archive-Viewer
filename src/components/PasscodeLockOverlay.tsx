import React, { useState, useEffect } from 'react';
import { Lock, Delete, AlertCircle, RefreshCw, KeyRound, ShieldAlert } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { sqliteService } from '../services/sqliteService';

export const PasscodeLockOverlay: React.FC = () => {
  const { isLocked, unlockApp, passcodeLockEnabled } = useTheme();
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!isLocked) {
      setPin('');
      setErrorMsg(null);
    }
  }, [isLocked]);

  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showForgotModal) return;
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) {
          handleAppendDigit(e.key);
        }
      } else if (e.key === 'Backspace') {
        handleDeleteDigit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin, showForgotModal]);

  if (!passcodeLockEnabled || !isLocked) return null;

  const handleAppendDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);

    if (nextPin.length === 4) {
      setTimeout(async () => {
        const success = await unlockApp(nextPin);
        if (!success) {
          setIsShaking(true);
          setErrorMsg('Incorrect PIN. Please try again.');
          setTimeout(() => {
            setIsShaking(false);
            setPin('');
          }, 500);
        } else {
          setPin('');
          setErrorMsg(null);
        }
      }, 100);
    }
  };

  const handleDeleteDigit = () => {
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
      setErrorMsg(null);
    }
  };

  const handleClearAll = () => {
    setPin('');
    setErrorMsg(null);
  };

  const handleResetApplication = async () => {
    setIsResetting(true);
    try {
      localStorage.clear();
      await sqliteService.resetDatabase();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 select-none p-4">
      {/* Centered Passcode Panel */}
      <div
        className={`w-full max-w-sm glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center text-center relative overflow-hidden transition-transform duration-200 ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Header Lock Badge */}
        <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight mb-1">
          Telegram Archive Locked
        </h2>
        <p className="text-xs text-neutral-400 mb-6">
          Enter your 4-digit PIN to access local chat archive
        </p>

        {/* 4-Digit Indicator Dots */}
        <div className="flex items-center gap-4 mb-6">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 border ${
                  isFilled
                    ? 'bg-blue-500 border-blue-400 scale-110 shadow-md shadow-blue-500/40'
                    : 'bg-white/5 border-white/20'
                }`}
              />
            );
          })}
        </div>

        {/* Error Feedback */}
        {errorMsg ? (
          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium mb-4 animate-in fade-in duration-150">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="h-5 mb-4" />
        )}

        {/* Touch Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleAppendDigit(digit)}
              className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-blue-500/20 border border-white/10 text-white font-semibold text-xl transition-all shadow-xs active:scale-95 flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClearAll}
            className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-neutral-400 text-xs font-semibold transition-all border border-white/5 active:scale-95 flex items-center justify-center cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={() => handleAppendDigit('0')}
            className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-blue-500/20 border border-white/10 text-white font-semibold text-xl transition-all shadow-xs active:scale-95 flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            onClick={handleDeleteDigit}
            className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-neutral-300 transition-all border border-white/5 active:scale-95 flex items-center justify-center cursor-pointer"
            aria-label="Delete"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Forgot Passcode Recovery Link */}
        <button
          onClick={() => setShowForgotModal(true)}
          className="text-xs text-neutral-400 hover:text-white transition-colors underline underline-offset-4 cursor-pointer"
        >
          Forgot PIN?
        </button>
      </div>

      {/* Forgot Passcode Recovery Dialog */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-neutral-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-left space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Cannot Recover PIN</h3>
                <span className="text-[11px] text-neutral-400">Security Access Policy</span>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Your PIN is stored locally and cannot be recovered if forgotten. The only way to regain access is to clear all local application data and re-import your Telegram archive folder.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForgotModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetApplication}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer shadow-md transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? 'Resetting...' : 'Clear Data & Reset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
