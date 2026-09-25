export const TELEGRAM_AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  userpic1: { bg: '#e17076', text: '#ffffff' }, // Red
  userpic2: { bg: '#faa774', text: '#ffffff' }, // Orange
  userpic3: { bg: '#a695e7', text: '#ffffff' }, // Violet
  userpic4: { bg: '#7bc862', text: '#ffffff' }, // Green
  userpic5: { bg: '#6ec9cb', text: '#ffffff' }, // Cyan
  userpic6: { bg: '#65aadd', text: '#ffffff' }, // Blue
  userpic7: { bg: '#ee7aae', text: '#ffffff' }, // Pink
  userpic8: { bg: '#d475ce', text: '#ffffff' }, // Magenta
};

export function getAvatarStyle(colorClass?: string) {
  const c = TELEGRAM_AVATAR_COLORS[colorClass || 'userpic6'] || TELEGRAM_AVATAR_COLORS.userpic6;
  return {
    backgroundColor: c.bg,
    color: c.text,
  };
}

export function getSenderTextColor(colorClass?: string) {
  const c = TELEGRAM_AVATAR_COLORS[colorClass || 'userpic6'] || TELEGRAM_AVATAR_COLORS.userpic6;
  return c.bg;
}
