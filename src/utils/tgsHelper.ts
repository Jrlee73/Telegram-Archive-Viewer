import pako from 'pako';

export interface LottieSpecs {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  layerCount: number;
  assetCount: number;
  durationSeconds: number;
  rawJson: any;
}

export async function loadAndDecompressTgs(url: string): Promise<{ data: any; specs: LottieSpecs } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch TGS file: ${resp.status} ${resp.statusText}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    let jsonStr: string;
    // Check gzip magic bytes (0x1F, 0x8B)
    if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
      const decompressed = pako.ungzip(uint8);
      jsonStr = new TextDecoder('utf-8').decode(decompressed);
    } else {
      try {
        const decompressed = pako.inflate(uint8);
        jsonStr = new TextDecoder('utf-8').decode(decompressed);
      } catch {
        jsonStr = new TextDecoder('utf-8').decode(uint8);
      }
    }

    const data = JSON.parse(jsonStr);
    const fr = Number(data.fr) || 60;
    const ip = Number(data.ip) || 0;
    const op = Number(data.op) || 60;
    const durationSeconds = Math.max(0, parseFloat(((op - ip) / fr).toFixed(2)));

    const specs: LottieSpecs = {
      v: String(data.v || 'Unknown'),
      fr,
      ip,
      op,
      w: Number(data.w) || 512,
      h: Number(data.h) || 512,
      layerCount: Array.isArray(data.layers) ? data.layers.length : 0,
      assetCount: Array.isArray(data.assets) ? data.assets.length : 0,
      durationSeconds,
      rawJson: data,
    };

    return { data, specs };
  } catch (err) {
    console.warn('Error loading or decompressing TGS:', err);
    return null;
  }
}
