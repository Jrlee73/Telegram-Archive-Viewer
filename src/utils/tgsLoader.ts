import { inflate } from 'pako';

export interface LottieJsonData {
  v?: string;
  fr?: number;
  ip?: number;
  op?: number;
  w?: number;
  h?: number;
  layers?: any[];
  assets?: any[];
  nm?: string;
  [key: string]: any;
}

const tgsCache = new Map<string, LottieJsonData>();

/**
 * Loads and decompresses a .tgs (gzipped Lottie JSON) or standard .json Lottie animation.
 */
export async function loadTgsOrLottie(url: string): Promise<LottieJsonData> {
  if (!url) {
    throw new Error('No URL provided');
  }

  if (tgsCache.has(url)) {
    return tgsCache.get(url)!;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sticker file (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  let jsonString: string;

  try {
    // Attempt gzip decompression (standard for Telegram .tgs stickers)
    const inflated = inflate(new Uint8Array(arrayBuffer));
    const decoder = new TextDecoder('utf-8');
    jsonString = decoder.decode(inflated);
  } catch {
    // Fallback to plain UTF-8 text if uncompressed JSON
    const decoder = new TextDecoder('utf-8');
    jsonString = decoder.decode(arrayBuffer);
  }

  const parsed = JSON.parse(jsonString) as LottieJsonData;
  tgsCache.set(url, parsed);
  return parsed;
}
