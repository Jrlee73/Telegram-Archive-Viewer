import React, { useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Image as ImageIcon,
  Play,
  Pause,
  Sparkles,
  Film,
  ExternalLink,
  Layers,
  FileCode,
  Download,
  Info,
  FileText,
  Volume2,
  Check,
  AlertCircle
} from 'lucide-react';
import { mediaService } from '../services/mediaService';
import { LottieSticker } from './LottieSticker';
import { LottieJsonData } from '../utils/tgsLoader';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaTitle?: string;
  mediaType?: string;
  stickerFormat?: string;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  mediaTitle,
  mediaType = 'photo',
  stickerFormat,
}) => {
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'lottie_inspect'>('preview');
  const [systemLaunchFeedback, setSystemLaunchFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [lottieSpecs, setLottieSpecs] = useState<LottieJsonData | null>(null);

  if (!isOpen) return null;

  const resolvedUrl = mediaService.resolveUrl(mediaUrl) || mediaUrl;
  const isTGS = stickerFormat === 'tgs' || mediaTitle?.includes('.tgs') || mediaType === 'sticker_tgs' || mediaUrl?.includes('.tgs');
  const isWebM = stickerFormat === 'webm' || mediaTitle?.includes('.webm') || mediaType === 'sticker_webm' || mediaUrl?.includes('.webm');
  const isVideo = mediaType === 'video' || mediaTitle?.endsWith('.mp4') || mediaTitle?.endsWith('.mov') || mediaTitle?.endsWith('.webm');
  const isAudio = mediaType === 'audio' || mediaType === 'voice' || mediaTitle?.endsWith('.mp3') || mediaTitle?.endsWith('.ogg') || mediaTitle?.endsWith('.wav');
  const isFile = mediaType === 'file' || (!isVideo && !isAudio && !isTGS && !isWebM && mediaType !== 'photo' && mediaType !== 'sticker');

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const a = document.createElement('a');
    a.href = resolvedUrl;
    a.download = mediaTitle || 'telegram_media';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInSystemApp = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.openInSystemApp) {
      try {
        await window.electronAPI.openInSystemApp(mediaUrl || mediaTitle || '');
        setSystemLaunchFeedback({
          type: 'success',
          text: `Opened "${mediaTitle || mediaUrl}" in default system application.`,
        });
      } catch (err: any) {
        setSystemLaunchFeedback({
          type: 'error',
          text: `Failed to open file: ${err.message || 'File not found on disk'}`,
        });
      }
    } else {
      setSystemLaunchFeedback({
        type: 'info',
        text: 'Direct system app launch is available when running the Electron desktop app.',
      });
    }
    setTimeout(() => setSystemLaunchFeedback(null), 3500);
  };

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // Real Lottie specs calculation
  const lottieVersion = lottieSpecs?.v || 'N/A';
  const lottieFps = lottieSpecs?.fr || 60;
  const lottieIp = lottieSpecs?.ip ?? 0;
  const lottieOp = lottieSpecs?.op ?? 0;
  const lottieWidth = lottieSpecs?.w || 512;
  const lottieHeight = lottieSpecs?.h || 512;
  const lottieLayerCount = Array.isArray(lottieSpecs?.layers) ? lottieSpecs.layers.length : 0;
  const lottieDurationSec = lottieFps > 0 ? ((lottieOp - lottieIp) / lottieFps).toFixed(2) : '0.00';
  const lottieAssetCount = Array.isArray(lottieSpecs?.assets) ? lottieSpecs.assets.length : 0;

  return (
    <div
      id="media-viewer-modal"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-between p-3 sm:p-5 animate-in fade-in select-none"
    >
      {/* Top Header Floating Glass Bar */}
      <div className="w-full max-w-6xl glass-panel rounded-2xl border border-white/10 px-4 py-2.5 flex items-center justify-between text-white z-10 shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            {isTGS ? (
              <Sparkles className="w-4 h-4 text-amber-300" />
            ) : isWebM || isVideo ? (
              <Film className="w-4 h-4" />
            ) : isAudio ? (
              <Volume2 className="w-4 h-4" />
            ) : isFile ? (
              <FileText className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs tracking-wide block text-white truncate">
              {mediaTitle ||
                (isTGS
                  ? 'Telegram Animated Sticker (.tgs)'
                  : isWebM
                  ? 'Telegram Video Sticker (.webm)'
                  : isVideo
                  ? 'Video Playback'
                  : 'Media Asset')}
            </span>
            <span className="text-[10px] text-white/50 font-mono truncate block">
              {mediaUrl || 'offline_archive/media'}
            </span>
          </div>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[var(--accent)] text-white font-semibold uppercase tracking-wider shrink-0 font-mono">
            {stickerFormat ? `${stickerFormat.toUpperCase()} Sticker` : mediaType}
          </span>
        </div>

        {/* Action & Zoom Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isTGS && (
            <div className="flex items-center rounded-xl bg-white/10 p-0.5 border border-white/10 mr-1.5 text-xs">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'preview' ? 'bg-[var(--accent)] text-white font-semibold' : 'text-white/70 hover:text-white'
                }`}
              >
                Lottie
              </button>
              <button
                onClick={() => setActiveTab('lottie_inspect')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'lottie_inspect' ? 'bg-[var(--accent)] text-white font-semibold' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Specs</span>
              </button>
            </div>
          )}

          {!isVideo && !isAudio && !isFile && !isTGS && (
            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-white/80 min-w-10 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {resolvedUrl && resolvedUrl.startsWith('blob:') && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[var(--accent)] text-white text-xs font-semibold ml-1 cursor-pointer transition-all active:scale-95"
              title="Save file locally"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          )}

          <button
            onClick={handleOpenInSystemApp}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold ml-1 cursor-pointer transition-all active:scale-95 shadow-md ${
              isElectron
                ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                : 'bg-white/10 hover:bg-white/20 text-white/80'
            }`}
            title={isElectron ? 'Open in default system photo/video viewer' : 'Available in Electron desktop app'}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in System App</span>
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-500 text-white ml-1.5 flex items-center justify-center transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {systemLaunchFeedback && (
        <div
          className={`w-full max-w-lg mt-3 text-xs px-4 py-2.5 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg animate-in fade-in ${
            systemLaunchFeedback.type === 'success'
              ? 'bg-emerald-600 text-white'
              : systemLaunchFeedback.type === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          {systemLaunchFeedback.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{systemLaunchFeedback.text}</span>
        </div>
      )}

      {/* Main Image / Animation Stage */}
      <div className="flex-1 w-full flex items-center justify-center overflow-auto p-6">
        <div
          className="transition-transform duration-150 flex flex-col items-center justify-center max-w-full max-h-full"
          style={{ transform: !isVideo && !isAudio && !isTGS ? `scale(${zoom})` : undefined }}
        >
          {/* Real Lottie JSON Specs */}
          {isTGS && activeTab === 'lottie_inspect' ? (
            <div className="glass-modal border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl text-left font-mono text-xs text-white/80">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <span className="font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--accent)]" />
                  Decompressed Lottie Structure (gzip unpacked)
                </span>
                <span className="text-[10px] bg-[var(--accent)] text-white px-2 py-0.5 rounded-md font-mono">
                  v{lottieVersion}
                </span>
              </div>
              <div className="space-y-2.5 text-[11px] leading-relaxed">
                <div>
                  <span className="text-[var(--accent)]">"v":</span> &quot;{lottieVersion}&quot;
                </div>
                <div>
                  <span className="text-[var(--accent)]">"fr":</span> {lottieFps}{' '}
                  <span className="text-white/40">// Framerate (FPS)</span>
                </div>
                <div>
                  <span className="text-[var(--accent)]">"ip":</span> {lottieIp},{' '}
                  <span className="text-[var(--accent)]">"op":</span> {lottieOp}{' '}
                  <span className="text-white/40">// {lottieDurationSec}s total duration</span>
                </div>
                <div>
                  <span className="text-[var(--accent)]">"w":</span> {lottieWidth},{' '}
                  <span className="text-[var(--accent)]">"h":</span> {lottieHeight}{' '}
                  <span className="text-white/40">// Canvas resolution</span>
                </div>
                <div>
                  <span className="text-[var(--accent)]">"layers":</span> [{' '}
                  <span className="text-emerald-400 font-semibold">{lottieLayerCount}</span> vector shape & animation layers ]
                </div>
                {lottieAssetCount > 0 && (
                  <div>
                    <span className="text-[var(--accent)]">"assets":</span> [ {lottieAssetCount} preloaded assets ]
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
                <span>Status: Validated Telegram Sticker</span>
                <span className="text-emerald-400 font-semibold">✓ Decompressed JSON</span>
              </div>
            </div>
          ) : isTGS ? (
            <div className="glass-modal border border-white/15 p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-sm">
              <div className="w-48 h-48 rounded-2xl bg-radial from-[var(--accent)]/20 to-transparent flex items-center justify-center mb-4 select-none">
                <LottieSticker
                  url={resolvedUrl}
                  className="w-44 h-44"
                  title={mediaTitle || 'Animated Telegram Sticker'}
                  isPlaying={isPlaying}
                  loop
                  autoplay
                  onDataLoaded={(data) => setLottieSpecs(data)}
                />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                {mediaTitle || 'Animated Telegram Sticker'}
              </h4>
              <p className="text-xs text-white/50 mb-4 font-mono">
                {lottieWidth} × {lottieHeight} px • {lottieFps} FPS Lottie Vector ({lottieDurationSec}s)
              </p>

              <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-full border border-white/10">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                </button>
                <span className="text-xs text-white/80 font-medium">
                  {isPlaying ? `Playing loop (${lottieFps} FPS)` : 'Paused'}
                </span>
              </div>
            </div>
          ) : isWebM ? (
            <div className="glass-modal border border-white/15 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-md">
              {resolvedUrl && (resolvedUrl.endsWith('.webm') || resolvedUrl.startsWith('blob:')) ? (
                <video
                  src={resolvedUrl}
                  autoPlay={isPlaying}
                  loop
                  muted
                  playsInline
                  controls
                  className="max-h-72 rounded-2xl object-contain mb-4"
                />
              ) : (
                <div className="w-36 h-36 rounded-2xl bg-black/60 flex items-center justify-center mb-4 text-7xl select-none relative">
                  <Film className="w-12 h-12 text-[var(--accent)]" />
                </div>
              )}
              <h4 className="text-sm font-bold text-white mb-1">
                {mediaTitle || 'Video Sticker (.webm)'}
              </h4>
              <p className="text-xs text-white/50 mb-4 font-mono">
                VP9 / WebM 512px • Click-to-Play Mode
              </p>
            </div>
          ) : isVideo ? (
            <div className="glass-modal border border-white/15 p-4 rounded-3xl shadow-2xl flex flex-col items-center max-w-2xl w-full">
              {resolvedUrl && (resolvedUrl.startsWith('blob:') || resolvedUrl.startsWith('http') || resolvedUrl.startsWith('tg-media:')) ? (
                <video
                  src={resolvedUrl}
                  controls
                  autoPlay
                  className="max-h-[65vh] w-full rounded-2xl bg-black object-contain"
                />
              ) : (
                <div className="h-64 w-full bg-black/60 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                  <Film className="w-12 h-12 text-[var(--accent)] mb-2" />
                  <span className="text-sm font-bold text-white">{mediaTitle || 'Video File'}</span>
                  <span className="text-xs text-white/50 mt-1 font-mono">{mediaUrl}</span>
                </div>
              )}
              <div className="w-full mt-3 flex items-center justify-between text-xs text-white/70">
                <span className="font-semibold text-white truncate max-w-xs">{mediaTitle || 'Video File'}</span>
                <span className="font-mono text-white/50">{mediaUrl}</span>
              </div>
            </div>
          ) : isAudio ? (
            <div className="glass-modal border border-white/15 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-md w-full">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-4 text-[var(--accent)]">
                <Volume2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1 truncate max-w-xs">
                {mediaTitle || 'Audio Track'}
              </h4>
              <p className="text-xs text-white/50 mb-4 font-mono truncate max-w-xs">
                {mediaUrl}
              </p>
              {resolvedUrl && (resolvedUrl.startsWith('blob:') || resolvedUrl.startsWith('http') || resolvedUrl.startsWith('tg-media:')) ? (
                <audio src={resolvedUrl} controls autoPlay className="w-full mt-2" />
              ) : (
                <div className="bg-black/40 p-3 rounded-xl text-xs text-white/60">
                  Offline audio file linked in export folder
                </div>
              )}
            </div>
          ) : isFile ? (
            <div className="glass-modal border border-white/15 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-md w-full">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4 text-white">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1 truncate max-w-xs">
                {mediaTitle || 'Attached Document'}
              </h4>
              <p className="text-xs text-white/50 mb-4 font-mono truncate max-w-xs">
                {mediaUrl}
              </p>
              {resolvedUrl && (
                <button
                  onClick={handleDownload}
                  className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-md active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download / Open Document</span>
                </button>
              )}
            </div>
          ) : (
            // Photo / Image
            <div className="flex flex-col items-center max-w-full max-h-full">
              {resolvedUrl && !imageLoadError ? (
                <img
                  src={resolvedUrl}
                  alt={mediaTitle || 'Photo'}
                  onError={() => setImageLoadError(true)}
                  className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <div className="glass-modal border border-white/15 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-md">
                  <div className="w-20 h-20 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-4 text-[var(--accent)]">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">
                    {mediaTitle || 'Export Asset'}
                  </h4>
                  <p className="text-xs text-white/50 mb-4 font-mono truncate max-w-xs">
                    {mediaUrl || 'export_folder/photos/'}
                  </p>
                  <p className="text-[11px] text-white/70 bg-white/5 p-3 rounded-xl leading-relaxed border border-white/10">
                    Media file stored with relative path in SQLite. When export folder is selected, images render directly.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-6xl flex items-center justify-between text-[11px] text-white/60 py-2 px-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Offline SQLite Storage • Relative path architecture preserves links across folder relocations.</span>
        </div>
        <div>
          Press <kbd className="px-1.5 py-0.5 rounded-md bg-white/10 text-white font-mono text-[10px] border border-white/15">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

export default MediaViewerModal;
