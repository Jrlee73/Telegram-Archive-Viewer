import React, { useState } from 'react';
import { TelegramMessage } from '../types';
import { getAvatarStyle, getSenderTextColor } from '../utils/telegramColors';
import { mediaService } from '../services/mediaService';
import { useTheme } from '../context/ThemeContext';
import { LottieSticker } from './LottieSticker';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Music,
  Mic,
  FileText,
  CornerUpLeft,
  CheckCheck,
  Play,
  Pause,
  Share2,
  Sparkles,
  ExternalLink,
  Film,
  Image as ImageIcon
} from 'lucide-react';

interface MessageBubbleProps {
  message: TelegramMessage;
  isSelf: boolean;
  isHighlighted?: boolean;
  onJumpToReply?: (targetId: number) => void;
  onOpenMedia?: (url: string, title?: string, type?: string, stickerFormat?: string) => void;
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isSelf,
  isHighlighted,
  onJumpToReply,
  onOpenMedia,
}) => {
  const { showTimestamps, compactSpacing, showAvatars, bubbleFontSize, previewPhotos, previewVideos, displayStickers } = useTheme();
  const [isPlayingInlineVideo, setIsPlayingInlineVideo] = useState(false);
  const [isPlayingLottie, setIsPlayingLottie] = useState(false);

  // Service message (Date Separator, System)
  if (message.msgType === 'service') {
    return (
      <div
        id={`message-${message.id}`}
        data-msg-id={message.id}
        className={`flex justify-center py-2.5 select-none rounded-lg ${
          isHighlighted ? 'animate-message-highlight' : ''
        }`}
      >
        <span
          className={`bg-[var(--bubble-service-bg)] text-[var(--bubble-service-text)] text-[11px] font-medium px-3.5 py-1 rounded-xl shadow-xs border border-[var(--border-card)] backdrop-blur-md ${
            isHighlighted ? 'animate-bubble-highlight' : ''
          }`}
        >
          {message.textContent}
        </span>
      </div>
    );
  }

  const avatarStyle = getAvatarStyle(message.senderColor);
  const senderColor = getSenderTextColor(message.senderColor);

  const isSticker = message.media?.type === 'sticker';
  const stickerFmt = message.media?.stickerFormat || 'webp';
  const isPureSticker = isSticker && !message.textContent && !message.replyTo;
  const resolvedMediaUrl = message.media?.url ? (mediaService.resolveUrl(message.media.url) || message.media.url) : '';

  return (
    <div
      id={`message-${message.id}`}
      data-msg-id={message.id}
      className={`group flex items-end gap-2.5 px-3 sm:px-4 ${
        compactSpacing ? 'py-0.5' : 'py-1.5'
      } rounded-lg ${
        isSelf ? 'justify-end' : 'justify-start'
      } ${
        isHighlighted ? 'animate-message-highlight' : ''
      }`}
    >
      {/* Avatar (Left side, only if not self, not joined message, and showAvatars is true) */}
      {!isSelf && showAvatars && (
        <div className="w-9 h-9 shrink-0 mb-0.5">
          {message.msgType !== 'joined' ? (
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs select-none shadow-xs border border-black/5 dark:border-white/10"
              style={avatarStyle}
              title={message.senderName}
            >
              {message.senderInitials || message.senderName?.slice(0, 1) || '?'}
            </div>
          ) : (
            <div className="w-9 h-9" />
          )}
        </div>
      )}

      {/* Bubble Container */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] md:max-w-[580px] px-4 py-2.5 shadow-sm text-xs leading-relaxed transition-all duration-150 ${
          isPureSticker
            ? 'bg-transparent p-0 shadow-none'
            : isSelf
            ? 'bg-[var(--bubble-self)] text-[var(--bubble-self-text)] rounded-2xl rounded-br-xs'
            : 'bg-[var(--bubble-other)] text-[var(--bubble-other-text)] rounded-2xl rounded-bl-xs border border-[var(--bubble-other-border)]'
        } ${
          isHighlighted ? 'animate-bubble-highlight' : ''
        }`}
      >
        {/* Sender Name (only on first message in group) */}
        {!isSelf && message.msgType !== 'joined' && message.senderName && !isPureSticker && (
          <div
            className="font-bold text-[11px] mb-1 select-none cursor-pointer tracking-tight"
            style={{ color: senderColor }}
          >
            {message.senderName}
          </div>
        )}

        {/* Forward Header */}
        {message.forwardInfo && (
          <div className="flex items-center gap-1.5 text-[10px] mb-1.5 border-l-2 border-[var(--accent)] pl-2.5 py-0.5 opacity-90">
            <Share2 className="w-3 h-3 text-[var(--accent)]" />
            <span>
              Forwarded from{' '}
              <strong className="font-semibold">
                {message.forwardInfo.from}
              </strong>
            </span>
          </div>
        )}

        {/* Reply Header (Clickable to jump) */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToReply && onJumpToReply(message.replyTo!.msgId)}
            className="flex items-start gap-2 text-[11px] mb-2 p-2 rounded-xl bg-black/5 dark:bg-black/25 hover:bg-black/10 dark:hover:bg-black/35 border-l-2 border-[var(--accent)] cursor-pointer transition-colors select-none"
            title={`Jump to message #${message.replyTo.msgId}`}
          >
            <CornerUpLeft className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-semibold block text-[10px] opacity-90">
                {message.replyTo.sender || 'Reply to message'}
              </span>
              <p className="truncate text-[11px] opacity-80">
                {message.replyTo.text || `Message #${message.replyTo.msgId}`}
              </p>
            </div>
          </div>
        )}

        {/* Media Block */}
        {message.media && (
          <div className="my-1.5 rounded-xl overflow-hidden select-none">
            {/* Stickers */}
            {isSticker && (
              !displayStickers ? (
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title || 'Sticker',
                      'sticker',
                      stickerFmt
                    )
                  }
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/10 dark:bg-black/30 border border-black/5 dark:border-white/10 text-xs font-medium cursor-pointer hover:bg-black/15 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sticker (Display disabled)</span>
                </div>
              ) : stickerFmt === 'webp' ? (
                /* 1. Static WebP Sticker */
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title || 'Sticker',
                      'sticker',
                      'webp'
                    )
                  }
                  className="relative group/sticker cursor-pointer p-1 w-32 h-32 shrink-0 flex items-center justify-center"
                >
                  {resolvedMediaUrl ? (
                    <img
                      src={resolvedMediaUrl}
                      alt={message.media?.title || 'Sticker'}
                      loading="lazy"
                      className="w-32 h-32 object-contain hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                        if (sibling) sibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-32 h-32 rounded-2xl bg-black/10 dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col items-center justify-center p-2"
                    style={{ display: resolvedMediaUrl ? 'none' : 'flex' }}
                  >
                    <span className="text-4xl mb-1">✨</span>
                    <span className="text-[10px] opacity-60">Sticker (.webp)</span>
                  </div>
                </div>
              ) : stickerFmt === 'tgs' ? (
                /* 2. Animated TGS Sticker */
                <div
                  onClick={() => {
                    if (onOpenMedia) {
                      onOpenMedia(
                        resolvedMediaUrl || message.media?.url || '',
                        message.media?.title || 'Animated Sticker',
                        'sticker',
                        'tgs'
                      );
                    }
                  }}
                  className="relative group/tgs p-1 cursor-pointer rounded-2xl hover:scale-105 transition-transform"
                  title="Click to view full animated sticker"
                >
                  <LottieSticker
                    url={resolvedMediaUrl || message.media?.url || ''}
                    className="w-36 h-36"
                    title={message.media?.title || 'Animated Sticker'}
                    loop
                    autoplay
                    showBadge
                  />
                </div>
              ) : (
                /* 3. Video WEBM Sticker */
                <div
                  onClick={() => {
                    setIsPlayingInlineVideo(!isPlayingInlineVideo);
                    if (onOpenMedia) {
                      onOpenMedia(
                        resolvedMediaUrl || message.media?.url || '',
                        message.media?.title || 'Video Sticker',
                        'sticker',
                        'webm'
                      );
                    }
                  }}
                  className="relative group/webm w-40 h-40 flex flex-col items-center justify-center cursor-pointer p-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-[var(--accent)] transition-all duration-200"
                  title="Click to play video sticker"
                >
                  {resolvedMediaUrl ? (
                    <video
                      src={resolvedMediaUrl}
                      autoPlay={isPlayingInlineVideo}
                      loop
                      muted
                      playsInline
                      className="w-24 h-24 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-black/20 flex items-center justify-center text-5xl relative">
                      <span>🐸</span>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl group-hover/webm:bg-black/20 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white shadow-md">
                          {isPlayingInlineVideo ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5 fill-current" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5 bg-black/20 text-[var(--accent)] px-2 py-0.5 rounded text-[10px] font-mono">
                    <Film className="w-3 h-3" />
                    <span>WEBM Video</span>
                  </div>
                </div>
              )
            )}

            {/* Photo */}
            {message.media.type === 'photo' && (
              !previewPhotos ? (
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title,
                      'photo'
                    )
                  }
                  className="flex items-center gap-3 p-3 rounded-xl bg-black/10 dark:bg-black/30 border border-black/5 dark:border-white/10 cursor-pointer hover:bg-black/15 dark:hover:bg-black/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-xs block truncate">
                      {message.media.title || 'Photo'}
                    </span>
                    <span className="text-[10px] opacity-60 block">Preview disabled · Click to view</span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title,
                      'photo'
                    )
                  }
                  className="relative bg-black/10 dark:bg-black/30 rounded-xl overflow-hidden cursor-pointer hover:opacity-95 transition-opacity border border-black/5 dark:border-white/5 w-64 h-48 max-w-sm shrink-0 flex items-center justify-center shadow-xs"
                >
                  {resolvedMediaUrl ? (
                    <img
                      src={resolvedMediaUrl}
                      alt={message.media.title || 'Photo'}
                      loading="lazy"
                      className="w-full h-full object-cover rounded-xl"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                        if (sibling) sibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-full h-full bg-gradient-to-br from-black/5 to-black/20 dark:from-white/5 dark:to-transparent rounded-xl flex flex-col items-center justify-center p-3 text-center"
                    style={{ display: resolvedMediaUrl ? 'none' : 'flex' }}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-1.5 text-[var(--accent)]">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-xs truncate max-w-[200px]">
                      {message.media.title || 'Export Photo'}
                    </span>
                    <span className="text-[10px] opacity-60 mt-0.5">
                      {message.media.details || 'Click to view'}
                    </span>
                  </div>
                </div>
              )
            )}

            {/* Video File / Round Video */}
            {message.media.type === 'video' && (
              !previewVideos ? (
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title,
                      'video'
                    )
                  }
                  className="flex items-center gap-3 p-3 rounded-xl bg-black/10 dark:bg-black/30 border border-black/5 dark:border-white/10 cursor-pointer hover:bg-black/15 dark:hover:bg-black/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-xs block truncate">
                      {message.media.title || 'Video'}
                    </span>
                    <span className="text-[10px] opacity-60 block">
                      Preview disabled · {message.media.duration || 'Click to play'}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() =>
                    onOpenMedia &&
                    onOpenMedia(
                      resolvedMediaUrl || message.media?.url || '',
                      message.media?.title,
                      'video'
                    )
                  }
                  className="relative bg-black/10 dark:bg-black/30 rounded-xl p-3 text-center cursor-pointer border border-black/5 dark:border-white/5 group/video hover:border-[var(--accent)]/50 transition-colors"
                >
                  {message.media.details === 'Round video' ? (
                    <div className="w-36 h-36 mx-auto rounded-full bg-gradient-to-br from-black/10 to-black/30 border-2 border-[var(--accent)] flex flex-col items-center justify-center relative overflow-hidden shadow-lg">
                      <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white mb-1 shadow-md group-hover/video:scale-110 transition-transform">
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </div>
                      <span className="text-[10px] font-semibold">Round Video</span>
                      {message.media.duration && (
                        <span className="absolute bottom-2 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                          {message.media.duration}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="h-36 w-full bg-gradient-to-br from-black/10 to-black/30 rounded-xl flex flex-col items-center justify-center relative">
                      <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white mb-2 shadow-md group-hover/video:scale-110 transition-transform">
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </div>
                      <span className="text-[11px] font-semibold">
                        {message.media.title || 'Video file'}
                      </span>
                      {message.media.duration && (
                        <span className="absolute bottom-4 left-4 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md font-mono">
                          {message.media.duration}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Document / File */}
            {message.media.type === 'file' && (
              <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-black/25 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-black/35 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-xs truncate block">
                    {message.media.fileName || message.media.title || 'Attached document'}
                  </span>
                  <span className="text-[10px] opacity-60 block">
                    {message.media.fileSize || message.media.details || 'Document file'}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenMedia) {
                      onOpenMedia(resolvedMediaUrl || message.media?.url || '', message.media?.fileName || message.media?.title, 'file');
                    }
                  }}
                  className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-[11px] font-medium transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                >
                  Open
                </button>
              </div>
            )}

            {/* Audio Track */}
            {message.media.type === 'audio' && (
              <div
                onClick={() => {
                  if (onOpenMedia) {
                    onOpenMedia(resolvedMediaUrl || message.media?.url || '', message.media?.title, 'audio');
                  }
                }}
                className="flex items-center gap-3 p-2.5 bg-black/5 dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-black/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white shrink-0 shadow-sm hover:scale-105 transition-transform">
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-xs truncate block">
                    {message.media.title || 'Audio track'}
                  </span>
                  <span className="text-[10px] opacity-60 block">
                    {message.media.details || 'Audio file'}
                  </span>
                </div>
              </div>
            )}

            {/* Voice Note */}
            {message.media.type === 'voice' && (
              <div
                onClick={() => {
                  if (onOpenMedia) {
                    onOpenMedia(resolvedMediaUrl || message.media?.url || '', message.media?.title || 'Voice message', 'voice');
                  }
                }}
                className="flex items-center gap-3 p-2.5 bg-black/5 dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-black/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Mic className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 h-3">
                    <span className="w-1 h-2 bg-current opacity-70 rounded-full animate-pulse" />
                    <span className="w-1 h-4 bg-current opacity-90 rounded-full animate-pulse" />
                    <span className="w-1 h-1.5 bg-current opacity-60 rounded-full" />
                    <span className="w-1 h-3 bg-current opacity-80 rounded-full" />
                    <span className="w-1 h-2.5 bg-current opacity-70 rounded-full" />
                    <span className="w-1 h-1 bg-current opacity-50 rounded-full" />
                  </div>
                  {message.media.details && (
                    <span className="text-[10px] opacity-70 mt-1 block font-mono">
                      {message.media.details}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Call */}
            {message.media.type === 'call' && (
              <div className="flex items-center gap-2.5 p-2 bg-black/5 dark:bg-black/20 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                  <PhoneOff className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-xs block">
                    Call: {message.media.title}
                  </span>
                  <span className="text-[10px] opacity-70">
                    Status: {message.media.details}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Text Message Content */}
        {message.textContent && (
          <div
            className="whitespace-pre-wrap break-words leading-relaxed tracking-normal"
            style={{ fontSize: `${bubbleFontSize || 13}px`, lineHeight: 1.45 }}
          >
            {message.textContent}
          </div>
        )}

        {/* Reactions Pill */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap select-none">
            {message.reactions.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-black/30 border border-black/5 dark:border-white/10 text-[11px] font-medium shadow-2xs cursor-pointer hover:scale-105 transition-transform"
                title={`Reacted by: ${r.users.join(', ')}`}
              >
                <span>{r.emoji}</span>
                <span className="text-[10px] opacity-70 font-mono">{r.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp & Delivery status */}
        {(showTimestamps || isPureSticker) && (
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none font-mono tabular-nums ${
              isPureSticker
                ? 'bg-black/40 px-2 py-0.5 rounded-full text-white/90'
                : 'opacity-70'
            }`}
          >
            <span>{message.timeText || ''}</span>
            {isSelf && <CheckCheck className="w-3.5 h-3.5 opacity-90 text-current" />}
          </div>
        )}
      </div>
    </div>
  );
};

export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prev, next) => {
    return (
      prev.message === next.message &&
      prev.isSelf === next.isSelf &&
      prev.isHighlighted === next.isHighlighted &&
      prev.onJumpToReply === next.onJumpToReply &&
      prev.onOpenMedia === next.onOpenMedia
    );
  }
);
