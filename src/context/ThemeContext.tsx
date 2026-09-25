import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { sqliteService } from '../services/sqliteService';

export type Theme = 'light' | 'dark' | 'night';
export type BubbleColorId = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate';

const PASSCODE_SALT = 'tav_app_passcode_salt_v1';

export async function hashPasscode(pin: string): Promise<string> {
  if (!pin) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(`${PASSCODE_SALT}:${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface BubbleColorOption {
  id: BubbleColorId;
  name: string;
  color: string;
}

export const BUBBLE_COLOR_OPTIONS: BubbleColorOption[] = [
  { id: 'blue', name: 'Azure Blue', color: '#2563eb' },
  { id: 'emerald', name: 'Forest Emerald', color: '#059669' },
  { id: 'violet', name: 'Royal Violet', color: '#7c3aed' },
  { id: 'amber', name: 'Amber Sunset', color: '#d97706' },
  { id: 'rose', name: 'Crimson Rose', color: '#e11d48' },
  { id: 'slate', name: 'Slate Minimal', color: '#334155' },
];

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  bubbleColor: BubbleColorId;
  setBubbleColor: (c: BubbleColorId) => void;
  bubbleFontSize: number;
  setBubbleFontSize: (size: number) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  compactSpacing: boolean;
  setCompactSpacing: (compact: boolean) => void;
  showAvatars: boolean;
  setShowAvatars: (show: boolean) => void;

  // New Chat Settings
  previewPhotos: boolean;
  setPreviewPhotos: (val: boolean) => void;
  previewVideos: boolean;
  setPreviewVideos: (val: boolean) => void;
  displayStickers: boolean;
  setDisplayStickers: (val: boolean) => void;

  // New Appearance Settings
  followSystemTheme: boolean;
  setFollowSystemTheme: (val: boolean) => void;

  // New Privacy Settings
  autoDestructEnabled: boolean;
  setAutoDestructEnabled: (val: boolean) => void;
  passcodeLockEnabled: boolean;
  setPasscodeLockEnabled: (val: boolean) => void;
  passcode: string | null;
  setPasscode: (pin: string | null) => Promise<void>;
  autoLockTimeout: number; // in minutes
  setAutoLockTimeout: (mins: number) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  unlockApp: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  resetSettingsToDefault: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  bubbleColor: 'blue',
  setBubbleColor: () => {},
  bubbleFontSize: 13,
  setBubbleFontSize: () => {},
  showTimestamps: true,
  setShowTimestamps: () => {},
  compactSpacing: false,
  setCompactSpacing: () => {},
  showAvatars: true,
  setShowAvatars: () => {},

  previewPhotos: true,
  setPreviewPhotos: () => {},
  previewVideos: true,
  setPreviewVideos: () => {},
  displayStickers: true,
  setDisplayStickers: () => {},

  followSystemTheme: false,
  setFollowSystemTheme: () => {},

  autoDestructEnabled: false,
  setAutoDestructEnabled: () => {},
  passcodeLockEnabled: false,
  setPasscodeLockEnabled: () => {},
  passcode: null,
  setPasscode: async () => {},
  autoLockTimeout: 5,
  setAutoLockTimeout: () => {},
  isLocked: false,
  setIsLocked: () => {},
  unlockApp: async () => false,
  lockApp: () => {},
  resetSettingsToDefault: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('tav_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'night') return saved as Theme;
    } catch {}
    return 'dark';
  });

  const [bubbleColor, setBubbleColorState] = useState<BubbleColorId>(() => {
    try {
      const saved = localStorage.getItem('tav_bubble_color');
      if (saved && BUBBLE_COLOR_OPTIONS.some((o) => o.id === saved)) {
        return saved as BubbleColorId;
      }
    } catch {}
    return 'blue';
  });

  const [bubbleFontSize, setBubbleFontSizeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tav_bubble_font_size');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 12 && parsed <= 22) return parsed;
      }
    } catch {}
    return 13;
  });

  const [showTimestamps, setShowTimestampsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_show_timestamps');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const [compactSpacing, setCompactSpacingState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_compact_spacing');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  const [showAvatars, setShowAvatarsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_show_avatars');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  // Chat Settings
  const [previewPhotos, setPreviewPhotosState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_preview_photos');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const [previewVideos, setPreviewVideosState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_preview_videos');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const [displayStickers, setDisplayStickersState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_display_stickers');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  // Appearance Settings
  const [followSystemTheme, setFollowSystemThemeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_follow_system_theme');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  // Privacy Settings
  const [autoDestructEnabled, setAutoDestructEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_auto_destruct');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  const [passcodeLockEnabled, setPasscodeLockEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tav_passcode_lock_enabled');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  const [passcode, setPasscodeState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('tav_passcode_pin');
    } catch {}
    return null;
  });

  const [autoLockTimeout, setAutoLockTimeoutState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tav_auto_lock_timeout');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {}
    return 5;
  });

  // Lock state initialization: Always require PIN on startup if passcodeLockEnabled and passcode exists
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      const lockEnabled = localStorage.getItem('tav_passcode_lock_enabled') === 'true';
      const pin = localStorage.getItem('tav_passcode_pin');
      return lockEnabled && !!pin;
    } catch {
      return false;
    }
  });

  // Auto-migrate legacy plaintext PINs to SHA-256 hash
  useEffect(() => {
    try {
      const rawPin = localStorage.getItem('tav_passcode_pin');
      if (rawPin && (rawPin.length !== 64 || !/^[0-9a-f]{64}$/i.test(rawPin))) {
        hashPasscode(rawPin).then((hashed) => {
          if (hashed) {
            localStorage.setItem('tav_passcode_pin', hashed);
            setPasscodeState(hashed);
          }
        });
      }
    } catch {}
  }, []);

  // System Theme Listener
  useEffect(() => {
    if (!followSystemTheme) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const targetTheme: Theme = e.matches ? 'dark' : 'light';
      setThemeState((current) => (current === targetTheme ? current : targetTheme));
    };

    handleSystemThemeChange(mediaQuery);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }
  }, [followSystemTheme]);

  // Apply CSS root classes for Theme
  useEffect(() => {
    try {
      localStorage.setItem('tav_theme', theme);
    } catch {}
    sqliteService.setSetting('app_theme', theme);

    const root = document.documentElement;
    if (theme === 'night') {
      root.classList.add('night', 'dark');
      root.classList.remove('light');
    } else if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('night', 'light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark', 'night');
    }
  }, [theme]);

  // Bubble Color CSS Var
  useEffect(() => {
    try {
      localStorage.setItem('tav_bubble_color', bubbleColor);
    } catch {}
    sqliteService.setSetting('bubble_color', bubbleColor);

    const option = BUBBLE_COLOR_OPTIONS.find((o) => o.id === bubbleColor);
    if (option) {
      document.documentElement.style.setProperty('--bubble-self', option.color);
    }
  }, [bubbleColor]);

  // Bubble Font Size CSS Var
  useEffect(() => {
    try {
      localStorage.setItem('tav_bubble_font_size', String(bubbleFontSize));
    } catch {}
    sqliteService.setSetting('bubble_font_size', String(bubbleFontSize));
    document.documentElement.style.setProperty('--bubble-font-size', `${bubbleFontSize}px`);
  }, [bubbleFontSize]);

  // Inactivity tracking for Auto-Destruct & Auto-Lock Timeout
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, updateActivity));
    };
  }, []);

  useEffect(() => {
    const checkInactivityInterval = setInterval(() => {
      const elapsedMs = Date.now() - lastActivityRef.current;

      // 1. Auto-Destruct Check (5 minutes = 300,000ms)
      if (autoDestructEnabled && elapsedMs >= 300000) {
        console.warn('Auto-Destruct triggered: 5 minutes of total inactivity reached.');
        sqliteService.resetDatabase().then(() => {
          localStorage.clear();
          window.location.reload();
        });
        return;
      }

      // 2. Passcode Auto-Lock Check
      if (passcodeLockEnabled && passcode && !isLocked) {
        const timeoutMs = autoLockTimeout * 60 * 1000;
        if (elapsedMs >= timeoutMs) {
          setIsLocked(true);
        }
      }
    }, 4000);

    return () => clearInterval(checkInactivityInterval);
  }, [autoDestructEnabled, passcodeLockEnabled, passcode, isLocked, autoLockTimeout]);

  // Setters
  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'night' : 'light'));
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const setBubbleColor = (c: BubbleColorId) => {
    setBubbleColorState(c);
  };

  const setBubbleFontSize = (size: number) => {
    setBubbleFontSizeState(size);
  };

  const setShowTimestamps = (show: boolean) => {
    setShowTimestampsState(show);
    try {
      localStorage.setItem('tav_show_timestamps', String(show));
    } catch {}
    sqliteService.setSetting('show_timestamps', String(show));
  };

  const setCompactSpacing = (compact: boolean) => {
    setCompactSpacingState(compact);
    try {
      localStorage.setItem('tav_compact_spacing', String(compact));
    } catch {}
    sqliteService.setSetting('compact_spacing', String(compact));
  };

  const setShowAvatars = (show: boolean) => {
    setShowAvatarsState(show);
    try {
      localStorage.setItem('tav_show_avatars', String(show));
    } catch {}
    sqliteService.setSetting('show_avatars', String(show));
  };

  const setPreviewPhotos = (val: boolean) => {
    setPreviewPhotosState(val);
    try {
      localStorage.setItem('tav_preview_photos', String(val));
    } catch {}
  };

  const setPreviewVideos = (val: boolean) => {
    setPreviewVideosState(val);
    try {
      localStorage.setItem('tav_preview_videos', String(val));
    } catch {}
  };

  const setDisplayStickers = (val: boolean) => {
    setDisplayStickersState(val);
    try {
      localStorage.setItem('tav_display_stickers', String(val));
    } catch {}
  };

  const setFollowSystemTheme = (val: boolean) => {
    setFollowSystemThemeState(val);
    try {
      localStorage.setItem('tav_follow_system_theme', String(val));
    } catch {}
    if (val && window.matchMedia) {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeState(isDark ? 'dark' : 'light');
    }
  };

  const setAutoDestructEnabled = (val: boolean) => {
    setAutoDestructEnabledState(val);
    try {
      localStorage.setItem('tav_auto_destruct', String(val));
    } catch {}
  };

  const setPasscodeLockEnabled = (val: boolean) => {
    setPasscodeLockEnabledState(val);
    try {
      localStorage.setItem('tav_passcode_lock_enabled', String(val));
    } catch {}
  };

  const setPasscode = useCallback(async (pin: string | null) => {
    if (!pin) {
      setPasscodeState(null);
      try {
        localStorage.removeItem('tav_passcode_pin');
      } catch {}
      return;
    }
    const hashed = pin.length === 64 && /^[0-9a-f]{64}$/i.test(pin) ? pin : await hashPasscode(pin);
    setPasscodeState(hashed);
    try {
      localStorage.setItem('tav_passcode_pin', hashed);
    } catch {}
  }, []);

  const setAutoLockTimeout = (mins: number) => {
    setAutoLockTimeoutState(mins);
    try {
      localStorage.setItem('tav_auto_lock_timeout', String(mins));
    } catch {}
  };

  const unlockApp = useCallback(async (pin: string): Promise<boolean> => {
    if (!passcode) return true;
    const inputHash = await hashPasscode(pin);
    if (inputHash === passcode) {
      setIsLocked(false);
      return true;
    }
    return false;
  }, [passcode]);

  const lockApp = useCallback(() => {
    if (passcodeLockEnabled && passcode) {
      setIsLocked(true);
    }
  }, [passcodeLockEnabled, passcode]);

  const resetSettingsToDefault = useCallback(() => {
    setThemeState('dark');
    setBubbleColorState('blue');
    setBubbleFontSizeState(13);
    setShowTimestampsState(true);
    setCompactSpacingState(false);
    setShowAvatarsState(true);
    setPreviewPhotosState(true);
    setPreviewVideosState(true);
    setDisplayStickersState(true);
    setFollowSystemThemeState(false);
    setAutoDestructEnabledState(false);
    setPasscodeLockEnabledState(false);
    setPasscodeState(null);
    setAutoLockTimeoutState(5);
    setIsLocked(false);

    try {
      const keysToRemove = [
        'tav_theme',
        'tav_bubble_color',
        'tav_bubble_font_size',
        'tav_show_timestamps',
        'tav_compact_spacing',
        'tav_show_avatars',
        'tav_preview_photos',
        'tav_preview_videos',
        'tav_display_stickers',
        'tav_follow_system_theme',
        'tav_auto_destruct',
        'tav_passcode_lock_enabled',
        'tav_passcode_pin',
        'tav_auto_lock_timeout',
      ];
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
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
        setPasscode,
        autoLockTimeout,
        setAutoLockTimeout,
        isLocked,
        setIsLocked,
        unlockApp,
        lockApp,
        resetSettingsToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export default ThemeProvider;
