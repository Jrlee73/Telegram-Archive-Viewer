import { TelegramChat } from '../types';

export const OBSERVER_IDENTITY = '__observer__';

export interface ChatHeaderDisplayInfo {
  title: string;
  initials: string;
  colorClass: string;
  isObserver: boolean;
}

export function getChatHeaderDisplayInfo(
  chat: TelegramChat,
  participants: Array<{ name: string; count: number; initials: string; color: string }>,
  perspectiveIdentity?: string | null
): ChatHeaderDisplayInfo {
  const isObserver = perspectiveIdentity === OBSERVER_IDENTITY;

  const defaultInfo: ChatHeaderDisplayInfo = {
    title: chat.title,
    initials: chat.initials,
    colorClass: chat.colorClass,
    isObserver,
  };

  // Group chats always display original group title from database
  if (chat.chatType === 'group' || chat.chatType === 'channel' || participants.length > 2) {
    return defaultInfo;
  }

  // One-to-one chats
  if (participants.length === 2) {
    const p1 = participants[0];
    const p2 = participants[1];

    if (isObserver) {
      // Observer Mode: Display both participant names ("Alice and Bob")
      const combinedTitle = `${p1.name} and ${p2.name}`;
      const combinedInitials = `${p1.initials?.[0] || p1.name[0]}${p2.initials?.[0] || p2.name[0]}`.toUpperCase();
      return {
        title: combinedTitle,
        initials: combinedInitials,
        colorClass: chat.colorClass || 'userpic8',
        isObserver: true,
      };
    }

    // Participant Mode: Display the OTHER participant
    const selected = perspectiveIdentity || p1.name;
    const other = participants.find((p) => p.name !== selected) || p2;
    if (other) {
      return {
        title: other.name,
        initials: other.initials || other.name.slice(0, 2).toUpperCase(),
        colorClass: other.color || chat.colorClass,
        isObserver: false,
      };
    }
  }

  // Personal chat with single participant (e.g. Saved Messages / Self Chat)
  if (participants.length === 1) {
    const p = participants[0];
    return {
      title: p.name,
      initials: p.initials || p.name.slice(0, 2).toUpperCase(),
      colorClass: p.color || chat.colorClass,
      isObserver,
    };
  }

  return defaultInfo;
}
