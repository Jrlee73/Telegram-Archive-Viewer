import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import { loadTgsOrLottie, LottieJsonData } from '../utils/tgsLoader';
import { Sparkles, AlertCircle } from 'lucide-react';

interface LottieStickerProps {
  url: string;
  className?: string;
  autoplay?: boolean;
  loop?: boolean;
  isPlaying?: boolean;
  onDataLoaded?: (data: LottieJsonData) => void;
  title?: string;
  showBadge?: boolean;
}

export const LottieSticker: React.FC<LottieStickerProps> = ({
  url,
  className = 'w-32 h-32',
  autoplay = true,
  loop = true,
  isPlaying = true,
  onDataLoaded,
  title,
  showBadge = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(false);

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    if (!url) {
      setLoading(false);
      setError(true);
      return;
    }

    loadTgsOrLottie(url)
      .then((jsonData) => {
        if (isCancelled || !containerRef.current) return;

        if (onDataLoaded) {
          onDataLoaded(jsonData);
        }

        try {
          const anim = lottie.loadAnimation({
            container: containerRef.current,
            renderer: 'svg',
            loop,
            autoplay,
            animationData: jsonData,
          });

          animRef.current = anim;
          setLoading(false);

          if (!isPlaying) {
            anim.pause();
          }
        } catch (renderErr) {
          console.warn('Lottie render error:', renderErr);
          setError(true);
          setLoading(false);
        }
      })
      .catch((loadErr) => {
        console.warn('Failed to load TGS animation:', loadErr);
        if (!isCancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [url, loop, autoplay]);

  useEffect(() => {
    if (animRef.current) {
      if (isPlaying) {
        animRef.current.play();
      } else {
        animRef.current.pause();
      }
    }
  }, [isPlaying]);

  if (error) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5 border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] p-2 text-center select-none`}
        title={title || 'Animated Sticker (.tgs)'}
      >
        <Sparkles className="w-8 h-8 mb-1 opacity-50 text-amber-500" />
        <span className="text-[10px] font-medium opacity-75 truncate max-w-full px-1">
          {title || 'Animated Sticker'}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ visibility: loading ? 'hidden' : 'visible' }}
      />
      {showBadge && !loading && (
        <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider pointer-events-none">
          TGS
        </div>
      )}
    </div>
  );
};

export default LottieSticker;
