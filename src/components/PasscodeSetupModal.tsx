import React, { useState } from 'react';
import { KeyRound, Check, X, AlertCircle, Lock } from 'lucide-react';
import { useTheme, hashPasscode } from '../context/ThemeContext';

interface PasscodeSetupModalProps {
  isOpen: boolean;
  mode: 'setup' | 'disable' | 'change';
  onClose: () => void;
  onSuccess: () => void;
}

export const PasscodeSetupModal: React.FC<PasscodeSetupModalProps> = ({
  isOpen,
  mode,
  onClose,
  onSuccess,
}) => {
  const { passcode, setPasscode, setPasscodeLockEnabled } = useTheme();

  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(
    mode === 'disable' || (mode === 'change' && passcode) ? 'current' : 'new'
  );

  const [currentInput, setCurrentInput] = useState('');
  const [newInput, setNewInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDigit = async (digit: string) => {
    setError(null);
    if (step === 'current') {
      if (currentInput.length < 4) {
        const next = currentInput + digit;
        setCurrentInput(next);
        if (next.length === 4) {
          const hashedCurrent = await hashPasscode(next);
          if (hashedCurrent === passcode) {
            if (mode === 'disable') {
              await setPasscode(null);
              setPasscodeLockEnabled(false);
              onSuccess();
              onClose();
            } else {
              setStep('new');
              setCurrentInput('');
            }
          } else {
            setError('Incorrect current PIN');
            setTimeout(() => setCurrentInput(''), 400);
          }
        }
      }
    } else if (step === 'new') {
      if (newInput.length < 4) {
        const next = newInput + digit;
        setNewInput(next);
        if (next.length === 4) {
          setStep('confirm');
        }
      }
    } else if (step === 'confirm') {
      if (confirmInput.length < 4) {
        const next = confirmInput + digit;
        setConfirmInput(next);
        if (next.length === 4) {
          if (next === newInput) {
            await setPasscode(next);
            setPasscodeLockEnabled(true);
            onSuccess();
            onClose();
          } else {
            setError('PINs do not match. Try again.');
            setTimeout(() => {
              setConfirmInput('');
              setNewInput('');
              setStep('new');
            }, 500);
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    setError(null);
    if (step === 'current') {
      setCurrentInput((prev) => prev.slice(0, -1));
    } else if (step === 'new') {
      setNewInput((prev) => prev.slice(0, -1));
    } else if (step === 'confirm') {
      setConfirmInput((prev) => prev.slice(0, -1));
    }
  };

  const activeValue =
    step === 'current' ? currentInput : step === 'new' ? newInput : confirmInput;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-sm bg-[var(--bg-surface-card)] border border-[var(--border-subtle)] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] mb-3">
          <KeyRound className="w-6 h-6" />
        </div>

        <h3 className="text-base font-bold text-[var(--text-main)] tracking-tight">
          {step === 'current'
            ? 'Enter Current PIN'
            : step === 'new'
            ? 'Create 4-Digit PIN'
            : 'Confirm 4-Digit PIN'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 mb-5">
          {step === 'current'
            ? 'Enter your current PIN to proceed'
            : step === 'new'
            ? 'Choose a memorable 4-digit passcode'
            : 'Re-enter your PIN to verify'}
        </p>

        {/* PIN Indicators */}
        <div className="flex items-center gap-3.5 mb-5">
          {[0, 1, 2, 3].map((idx) => {
            const filled = activeValue.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                  filled
                    ? 'bg-[var(--accent)] border-[var(--accent)] scale-110 shadow-xs'
                    : 'bg-[var(--bg-surface-hover)] border-[var(--border-subtle)]'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <div className="text-xs text-rose-500 font-medium mb-3 flex items-center gap-1 animate-in fade-in">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-12 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] font-semibold text-lg border border-[var(--border-subtle)] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={() => {
              setCurrentInput('');
              setNewInput('');
              setConfirmInput('');
            }}
            className="h-12 rounded-xl bg-[var(--bg-surface-hover)] text-[var(--text-muted)] text-xs font-semibold border border-[var(--border-subtle)] active:scale-95 flex items-center justify-center cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="h-12 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-solid)] text-[var(--text-main)] font-semibold text-lg border border-[var(--border-subtle)] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-12 rounded-xl bg-[var(--bg-surface-hover)] text-[var(--text-main)] border border-[var(--border-subtle)] active:scale-95 flex items-center justify-center cursor-pointer"
          >
            ←
          </button>
        </div>
      </div>
    </div>
  );
};
