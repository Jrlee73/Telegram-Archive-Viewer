import { TelegramChat, TelegramMessage } from '../types';

export function parseToIsoTimestamp(dateFull?: string, dateDay?: string, timeText?: string): string {
  let str = (dateFull || '').trim();
  if (!str && dateDay) {
    str = `${dateDay} ${timeText || '00:00:00'}`.trim();
  }
  if (!str) return '1970-01-01 00:00:00';

  const rawStr = str.replace(/(?:UTC|[+-]\d{2}:?\d{2}|Z)\b/gi, '').trim();

  // 1. CJK Chinese format: 2024年4月15日 14:30:15 or 2024年04月15日 下午2:30
  const mCjk = rawStr.match(
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:[^\d]*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|a\.m\.|p\.m\.|上午|下午)?)?/i
  );
  if (mCjk) {
    const [, y, m, d, hr, mn, sc, ampm] = mCjk;
    let hrNum = hr ? parseInt(hr, 10) : 0;
    const mnNum = mn ? parseInt(mn, 10) : 0;
    const scNum = sc ? parseInt(sc, 10) : 0;
    if (ampm) {
      const ampmU = ampm.toUpperCase();
      if (ampmU.startsWith('P') || ampm.includes('下午')) {
        if (hrNum < 12) hrNum += 12;
      } else if (ampmU.startsWith('A') || ampm.includes('上午')) {
        if (hrNum === 12) hrNum = 0;
      }
    }
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${String(hrNum).padStart(2, '0')}:${String(mnNum).padStart(2, '0')}:${String(scNum).padStart(2, '0')}`;
  }

  // 2. ISO / YMD: 2024-04-15 14:30:15 or 2024/04/15 14:30
  const mYmd = rawStr.match(
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|a\.m\.|p\.m\.)?)?/i
  );
  if (mYmd) {
    const [, y, m, d, hr, mn, sc, ampm] = mYmd;
    let hrNum = hr ? parseInt(hr, 10) : 0;
    const mnNum = mn ? parseInt(mn, 10) : 0;
    const scNum = sc ? parseInt(sc, 10) : 0;
    if (ampm) {
      const ampmU = ampm.toUpperCase();
      if (ampmU.startsWith('P') && hrNum < 12) hrNum += 12;
      else if (ampmU.startsWith('A') && hrNum === 12) hrNum = 0;
    }
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${String(hrNum).padStart(2, '0')}:${String(mnNum).padStart(2, '0')}:${String(scNum).padStart(2, '0')}`;
  }

  // 3. DMY or MDY dots / slashes / hyphens: 15.04.2024 14:30:15 or 04/15/2024 14:30:15
  const mDmy = rawStr.match(
    /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|a\.m\.|p\.m\.)?)?/i
  );
  if (mDmy) {
    const [, d, m, y, hr, mn, sc, ampm] = mDmy;
    let dNum = parseInt(d, 10);
    let mNum = parseInt(m, 10);
    if (dNum <= 12 && mNum > 12) {
      const tmp = dNum;
      dNum = mNum;
      mNum = tmp;
    }
    let hrNum = hr ? parseInt(hr, 10) : 0;
    const mnNum = mn ? parseInt(mn, 10) : 0;
    const scNum = sc ? parseInt(sc, 10) : 0;
    if (ampm) {
      const ampmU = ampm.toUpperCase();
      if (ampmU.startsWith('P') && hrNum < 12) hrNum += 12;
      else if (ampmU.startsWith('A') && hrNum === 12) hrNum = 0;
    }
    return `${y.padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')} ${String(hrNum).padStart(2, '0')}:${String(mnNum).padStart(2, '0')}:${String(scNum).padStart(2, '0')}`;
  }

  // 4. Textual month names (Multi-language)
  const months: Record<string, number> = {
    january: 1, jan: 1, января: 1, янв: 1, enero: 1, janvier: 1, januar: 1, gennaio: 1,
    february: 2, feb: 2, февраля: 2, фев: 2, febrero: 2, février: 2, fevrier: 2, februar: 2, febbraio: 2,
    march: 3, mar: 3, марта: 3, мар: 3, marzo: 3, mars: 3, märz: 3, maerz: 3,
    april: 4, apr: 4, апреля: 4, апр: 4, abril: 4, avril: 4, aprile: 4,
    may: 5, мая: 5, mayo: 5, mai: 5, maggio: 5,
    june: 6, jun: 6, июня: 6, июн: 6, junio: 6, juin: 6, juni: 6, giugno: 6,
    july: 7, jul: 7, июля: 7, июл: 7, julio: 7, juillet: 7, juli: 7, luglio: 7,
    august: 8, aug: 8, августа: 8, авг: 8, agosto: 8, août: 8, aout: 8,
    september: 9, sep: 9, sept: 9, сентября: 9, сен: 9, septiembre: 9, setiembre: 9, septembre: 9, settembre: 9,
    october: 10, oct: 10, октября: 10, окт: 10, octubre: 10, octobre: 10, oktober: 10, ottobre: 10,
    november: 11, nov: 11, ноября: 11, ноя: 11, noviembre: 11, novembre: 11,
    december: 12, dec: 12, декабря: 12, дек: 12, diciembre: 12, décembre: 12, decembre: 12, dezember: 12, dicembre: 12,
  };

  const mText1 = rawStr.match(/(\d{1,2})\s+(?:de\s+)?([^\s\d\.,]+)[\.,]?\s+(?:de\s+)?(\d{4})/i);
  const mText2 = rawStr.match(/([^\s\d\.,]+)\s+(\d{1,2})[\.,]?\s+(\d{4})/i);

  if (mText1) {
    const [, dStr, monthStr, yStr] = mText1;
    const mKey = monthStr.toLowerCase().replace(/\.$/, '');
    if (months[mKey]) {
      const mNum = months[mKey];
      const mTime = rawStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|a\.m\.|p\.m\.)?/i);
      let hrNum = mTime ? parseInt(mTime[1], 10) : 0;
      const mnNum = mTime ? parseInt(mTime[2], 10) : 0;
      const scNum = (mTime && mTime[3]) ? parseInt(mTime[3], 10) : 0;
      const ampm = mTime ? mTime[4] : null;
      if (ampm) {
        const ampmU = ampm.toUpperCase();
        if (ampmU.startsWith('P') && hrNum < 12) hrNum += 12;
        else if (ampmU.startsWith('A') && hrNum === 12) hrNum = 0;
      }
      return `${yStr.padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${dStr.padStart(2, '0')} ${String(hrNum).padStart(2, '0')}:${String(mnNum).padStart(2, '0')}:${String(scNum).padStart(2, '0')}`;
    }
  }

  if (mText2) {
    const [, monthStr, dStr, yStr] = mText2;
    const mKey = monthStr.toLowerCase().replace(/\.$/, '');
    if (months[mKey]) {
      const mNum = months[mKey];
      const mTime = rawStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|a\.m\.|p\.m\.)?/i);
      let hrNum = mTime ? parseInt(mTime[1], 10) : 0;
      const mnNum = mTime ? parseInt(mTime[2], 10) : 0;
      const scNum = (mTime && mTime[3]) ? parseInt(mTime[3], 10) : 0;
      const ampm = mTime ? mTime[4] : null;
      if (ampm) {
        const ampmU = ampm.toUpperCase();
        if (ampmU.startsWith('P') && hrNum < 12) hrNum += 12;
        else if (ampmU.startsWith('A') && hrNum === 12) hrNum = 0;
      }
      return `${yStr.padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${dStr.padStart(2, '0')} ${String(hrNum).padStart(2, '0')}:${String(mnNum).padStart(2, '0')}:${String(scNum).padStart(2, '0')}`;
    }
  }

  return '1970-01-01 00:00:00';
}

export function sanitizeRelativeMediaPath(rawPath?: string | null): string | undefined {
  if (!rawPath) return undefined;
  if (rawPath.startsWith('data:') || rawPath.startsWith('blob:') || rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  let p = rawPath.replace(/\\/g, '/');
  p = p.replace(/^\.\//, '');
  p = p.replace(/^\//, '');
  return p.trim();
}

/**
 * Fast lightweight pre-check to test if an HTML string has basic Telegram export indicators.
 * Avoids expensive DOM parsing on large arbitrary HTML documents (e.g. documentation, web pages, code files).
 */
export function isPotentialTelegramExport(htmlContent: string): boolean {
  if (!htmlContent || htmlContent.length < 30) return false;

  // Telegram desktop export HTML files always contain the container and class markers
  const hasHistoryOrLayout =
    htmlContent.includes('class="history"') ||
    htmlContent.includes("class='history'") ||
    htmlContent.includes('class="page_body"') ||
    htmlContent.includes('class="page_layout"') ||
    htmlContent.includes('class="page_header"');

  const hasMessageMarkers =
    htmlContent.includes('class="message') ||
    htmlContent.includes("class='message'") ||
    htmlContent.includes('class="body details"') ||
    htmlContent.includes('class="date details"');

  return (hasHistoryOrLayout && hasMessageMarkers) || (htmlContent.includes('class="message') && htmlContent.includes('details'));
}

export interface ParseTelegramHtmlResult {
  chat: TelegramChat | null;
  messages: TelegramMessage[];
  nextSeq: number;
  isValidArchive: boolean;
  reason?: string;
}

export function parseTelegramHtml(
  htmlContent: string,
  filename: string = 'messages.html',
  defaultChatId?: string,
  defaultChatTitle?: string,
  fileIndex: number = 0,
  startSeq: number = 0
): ParseTelegramHtmlResult {
  // Fast lightweight pre-check
  if (!isPotentialTelegramExport(htmlContent)) {
    return {
      chat: null,
      messages: [],
      nextSeq: startSeq,
      isValidArchive: false,
      reason: 'No valid Telegram message structures detected',
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Query message containers
  const messageDivs = doc.querySelectorAll(
    '.history > .message, .history .message, .page_body .message, .page_layout .message, .message.default, .message.service'
  );

  if (messageDivs.length === 0) {
    return {
      chat: null,
      messages: [],
      nextSeq: startSeq,
      isValidArchive: false,
      reason: 'No valid Telegram messages detected',
    };
  }

  // Chat title
  const pageHeaderBold = doc.querySelector('.page_header .text.bold');
  const pageHeaderText = doc.querySelector('.page_header .text');
  const rawTitleTag = doc.querySelector('title')?.textContent?.replace(/Telegram\s*[-–:]\s*/i, '').trim();

  const extractedTitle =
    pageHeaderBold?.textContent?.trim() ||
    pageHeaderText?.textContent?.trim() ||
    rawTitleTag;

  const chatTitle =
    extractedTitle ||
    defaultChatTitle ||
    'Telegram Chat';

  const chatId =
    defaultChatId || (extractedTitle ? extractedTitle.replace(/[\\/*?:"<>| ]/g, '_').toLowerCase() : 'telegram_chat');

  const messages: TelegramMessage[] = [];

  let currentDay = '';
  let lastSenderName: string | undefined = undefined;
  let lastSenderInitials: string | undefined = undefined;
  let lastSenderColor: string | undefined = undefined;

  messageDivs.forEach((div, idx) => {
    const currentSeq = startSeq + idx;
    const divId = div.id || '';
    const classes = Array.from(div.classList);

    // Extract numeric ID
    let msgId = 0;
    const idMatch = divId.match(/message(-?\d+)/);
    if (idMatch) {
      msgId = parseInt(idMatch[1], 10);
    }

    // Service messages (Date Separators, Wallpaper/Theme changed, Channel info)
    if (classes.includes('service')) {
      const bodyDetails = div.querySelector('.body.details');
      const text = bodyDetails?.textContent?.trim() || div.textContent?.trim() || '';

      const parsedIso = parseToIsoTimestamp(text, '', '');
      if (parsedIso !== '1970-01-01 00:00:00') {
        currentDay = text;
      }

      const uniqueServiceId = msgId !== 0 ? msgId : -(currentSeq + 1);
      const isoDate = parseToIsoTimestamp('', currentDay, '');

      messages.push({
        seq: currentSeq,
        id: uniqueServiceId,
        chatId,
        msgType: 'service',
        dateText: isoDate,
        dateDay: currentDay,
        textContent: text,
        sourceFile: filename,
      });
      return;
    }

    const isJoined = classes.includes('joined');
    const msgType = isJoined ? 'joined' : 'default';

    // Date & Time
    const dateDiv = div.querySelector('.date.details');
    const timeText = dateDiv?.textContent?.trim() || '';
    const dateFull = dateDiv?.getAttribute('title') || '';

    // Sender details
    const fromNameDiv = div.querySelector('.from_name');
    const initialsDiv = div.querySelector('.initials');
    const userpicDiv = div.querySelector('.userpic');

    let senderName = fromNameDiv?.textContent?.trim();
    let senderInitials = initialsDiv?.textContent?.trim();
    let userpicClass = 'userpic1';

    if (userpicDiv) {
      const cls = Array.from(userpicDiv.classList).find(
        (c) => c.startsWith('userpic') && c !== 'userpic' && c !== 'userpic_wrap'
      );
      if (cls) userpicClass = cls;
    }

    if (isJoined) {
      senderName = lastSenderName;
      senderInitials = lastSenderInitials;
      userpicClass = lastSenderColor || 'userpic1';
    } else {
      lastSenderName = senderName;
      lastSenderInitials = senderInitials;
      lastSenderColor = userpicClass;
    }

    // Reply extraction
    let replyTo = undefined;
    const replyDiv = div.querySelector('.reply_to.details');
    if (replyDiv) {
      const a = replyDiv.querySelector('a');
      let targetId: number | undefined = undefined;
      if (a) {
        const href = a.getAttribute('href') || '';
        const onclick = a.getAttribute('onclick') || '';
        const m = onclick.match(/GoToMessage\((\d+)\)/) || href.match(/go_to_message(\d+)/);
        if (m) targetId = parseInt(m[1], 10);
      }
      replyTo = {
        msgId: targetId || 0,
        text: replyDiv.textContent?.replace('In reply to', '').trim() || 'Reply',
      };
    }

    // Forward extraction
    let forwardInfo = undefined;
    const fwdBody = div.querySelector('.forwarded.body');
    if (fwdBody) {
      const fwdName = fwdBody.querySelector('.from_name')?.textContent?.trim() || 'Forwarded';
      const fwdDate = fwdBody.querySelector('.date.details')?.getAttribute('title') || '';
      forwardInfo = {
        from: fwdName,
        date: fwdDate,
      };
    }

    // Media extraction with relative paths
    let media = undefined;
    const mediaWrap = div.querySelector('.media_wrap');
    if (mediaWrap) {
      if (mediaWrap.querySelector('.photo') || mediaWrap.querySelector('.photo_wrap')) {
        const pImg = mediaWrap.querySelector('.photo') as HTMLImageElement | null;
        const pA = mediaWrap.querySelector('.photo_wrap') as HTMLAnchorElement | null;
        const rawHref = pA?.getAttribute('href') || pImg?.getAttribute('src') || '';
        const relUrl = sanitizeRelativeMediaPath(rawHref);
        const thumbUrl = sanitizeRelativeMediaPath(pImg?.getAttribute('src'));
        media = {
          type: 'photo' as const,
          title: relUrl ? relUrl.split('/').pop() : 'Photo',
          url: relUrl,
          thumbUrl: thumbUrl || relUrl,
          details: pImg ? `${pImg.style.width} × ${pImg.style.height}` : undefined,
        };
      } else if (mediaWrap.querySelector('.sticker') || mediaWrap.querySelector('.sticker_wrap') || mediaWrap.querySelector('.animated_sticker')) {
        const sImg = mediaWrap.querySelector('.sticker, .animated_sticker') as HTMLImageElement | null;
        const sA = mediaWrap.querySelector('.sticker_wrap, .animated_sticker_wrap') as HTMLAnchorElement | null;
        const rawHref = sA?.getAttribute('href') || sImg?.getAttribute('src') || '';
        const relUrl = sanitizeRelativeMediaPath(rawHref) || '';
        let fmt: 'webp' | 'tgs' | 'webm' = 'webp';
        if (relUrl.endsWith('.tgs') || relUrl.includes('.tgs?')) fmt = 'tgs';
        else if (relUrl.endsWith('.webm') || relUrl.includes('.webm?') || relUrl.endsWith('.mp4')) fmt = 'webm';

        media = {
          type: 'sticker' as const,
          stickerFormat: fmt,
          title: relUrl ? relUrl.split('/').pop() : 'Sticker',
          url: relUrl,
          thumbUrl: sanitizeRelativeMediaPath(sImg?.getAttribute('src')),
        };
      } else if (mediaWrap.querySelector('.round_video_message_wrap') || mediaWrap.querySelector('.video_message_wrap')) {
        const vA = mediaWrap.querySelector('a') as HTMLAnchorElement | null;
        const vDur = mediaWrap.querySelector('.video_duration, .status.details')?.textContent?.trim();
        const relUrl = sanitizeRelativeMediaPath(vA?.getAttribute('href'));
        media = {
          type: 'video' as const,
          title: 'Round video message',
          url: relUrl || '',
          duration: vDur || undefined,
          details: 'Round video',
        };
      } else if (mediaWrap.querySelector('.video_file_wrap') || mediaWrap.querySelector('.animation_wrap')) {
        const vA = mediaWrap.querySelector('a') as HTMLAnchorElement | null;
        const vDur = mediaWrap.querySelector('.video_duration')?.textContent?.trim();
        const relUrl = sanitizeRelativeMediaPath(vA?.getAttribute('href')) || '';
        const isAnim = mediaWrap.querySelector('.animation_wrap') !== null || relUrl.includes('animations/');
        media = {
          type: 'video' as const,
          title: isAnim ? 'Animation (GIF)' : (relUrl.split('/').pop() || 'Video file'),
          url: relUrl,
          duration: vDur || (isAnim ? 'GIF' : undefined),
          details: isAnim ? 'Animation' : 'Video',
        };
      } else if (mediaWrap.querySelector('.media_audio_file')) {
        const aTitle = mediaWrap.querySelector('.title.bold')?.textContent?.trim();
        const aStatus = mediaWrap.querySelector('.status.details')?.textContent?.trim();
        const aLink = mediaWrap.querySelector('a') as HTMLAnchorElement | null;
        const relUrl = sanitizeRelativeMediaPath(aLink?.getAttribute('href'));
        media = {
          type: 'audio' as const,
          title: aTitle || 'Audio track',
          url: relUrl || '',
          details: aStatus || '',
          duration: aStatus || undefined,
        };
      } else if (mediaWrap.querySelector('.media_voice_message')) {
        const vStatus = mediaWrap.querySelector('.status.details')?.textContent?.trim();
        const vLink = mediaWrap.querySelector('a') as HTMLAnchorElement | null;
        const relUrl = sanitizeRelativeMediaPath(vLink?.getAttribute('href'));
        media = {
          type: 'voice' as const,
          title: 'Voice message',
          url: relUrl || '',
          details: vStatus || undefined,
          duration: vStatus || undefined,
        };
      } else if (mediaWrap.querySelector('.media_file') || mediaWrap.querySelector('.media_document')) {
        const fTitle = mediaWrap.querySelector('.title.bold, .title')?.textContent?.trim();
        const fStatus = mediaWrap.querySelector('.status.details, .details')?.textContent?.trim();
        const fLink = mediaWrap.querySelector('a') as HTMLAnchorElement | null;
        const relUrl = sanitizeRelativeMediaPath(fLink?.getAttribute('href')) || '';
        media = {
          type: 'file' as const,
          title: fTitle || (relUrl.split('/').pop() || 'Document'),
          fileName: fTitle || (relUrl.split('/').pop() || 'Document'),
          fileSize: fStatus || 'Document file',
          url: relUrl,
          details: fStatus || '',
        };
      } else if (mediaWrap.querySelector('.media_call')) {
        const cStatus = mediaWrap.querySelector('.status.details')?.textContent?.trim();
        media = {
          type: 'call' as const,
          title: 'Call',
          details: cStatus || 'Ended',
        };
      }
    }

    // Text content
    const textDiv = div.querySelector('.text');
    let textContent: string | undefined = undefined;
    if (textDiv) {
      const clone = textDiv.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      textContent = clone.textContent?.trim();
    }

    // Reactions
    const reactions: Array<{ emoji: string; count: number; users: string[] }> = [];
    const rSpan = div.querySelector('.reactions');
    if (rSpan) {
      rSpan.querySelectorAll('.reaction').forEach((r) => {
        const emoji = r.querySelector('.emoji')?.textContent?.trim() || '👍';
        const userList: string[] = [];
        r.querySelectorAll('.userpic .initials').forEach((u) => {
          userList.push(u.getAttribute('title') || 'User');
        });
        reactions.push({ emoji, count: Math.max(1, userList.length), users: userList });
      });
    }

    const finalMsgId = msgId > 0 ? msgId : currentSeq + 1;
    const isoDate = parseToIsoTimestamp(dateFull, currentDay, timeText);

    messages.push({
      seq: currentSeq,
      id: finalMsgId,
      chatId,
      msgType,
      senderName,
      senderInitials,
      senderColor: userpicClass,
      dateText: isoDate,
      timeText,
      dateDay: currentDay,
      textContent,
      replyTo,
      forwardInfo,
      media,
      reactions: reactions.length > 0 ? reactions : undefined,
      sourceFile: filename,
    });
  });

  const chatInitials = chatTitle
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'TC';

  const validMsgs = messages.filter((m) => m.msgType !== 'service');
  const lastMsg = validMsgs[validMsgs.length - 1] || messages[messages.length - 1];

  const chat: TelegramChat | null =
    messages.length > 0
      ? {
          id: chatId,
          title: chatTitle,
          chatType: 'personal',
          totalMessages: validMsgs.length > 0 ? validMsgs.length : messages.length,
          lastMessage: lastMsg?.textContent || (lastMsg?.media ? `[${lastMsg.media.type}]` : 'Chat archive'),
          lastDate: lastMsg?.timeText || '',
          initials: chatInitials,
          colorClass: 'userpic4',
        }
      : null;

  return {
    chat,
    messages,
    nextSeq: startSeq + messages.length,
    isValidArchive: messages.length > 0,
    reason: messages.length > 0 ? undefined : 'No valid Telegram messages detected',
  };
}
