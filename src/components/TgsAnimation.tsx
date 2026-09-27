import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import { loadAndDecompressTgs, LottieSpecs } from '../utils/tgsHelper';
import { Sparkles } from 'lucide-react';

interface TgsAnimationProps {
  src: string;
  autoplay?: boolean;
  loop?: boolean;
  isPlaying?: boolean;
  className?: string;
  onSpecsLoaded?: (specs: LottieSpecs) => void;
  onClick?: () => void;
}

export const TgsAnimation: React.FC<TgsAnimationProps> = ({
  src,
  autoplay = true,
  loop = true,
  isPlaying = true,
  className = '',
  onSpecsLoaded,
  onClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setHasError(false);

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    if (!src) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    loadAndDecompressTgs(src)
      .then((res) => {
        if (isCancelled) return;
        if (!res || !containerRef.current) {
          setIsLoading(false);
          setHasError(true);
          return;
        }

        setIsLoading(false);
        if (onSpecsLoaded) {
          onSpecsLoaded(res.specs);
        }

        try {
          const anim = lottie.loadAnimation({
            container: containerRef.current,
            renderer: 'svg',
            loop,
            autoplay,
            animationData: res.data,
          });
          animRef.current = anim;
          if (!isPlaying) {
            anim.pause();
          }
        } catch (err) {
          console.warn('Lottie failed to load animation:', err);
          setHasError(true);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoading(false);
          setHasError(true);
        }
      });

    return () => {
      isCancelled = true;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [src]);

  useEffect(() => {
    if (animRef.current) {
      if (isPlaying) {
        animRef.current.play();
      } else {
        animRef.current.pause();
      }
    }
  }, [isPlaying]);

  if (hasError) {
    return (
      <div
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-3 text-center rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 ${className}`}
      >
        <Sparkles className="w-8 h-8 text-[var(--accent)] opacity-60 mb-1" />
        <span className="text-[10px] font-mono text-[var(--text-muted)]">Sticker (.tgs)</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full" />
    </div>
  );
};
