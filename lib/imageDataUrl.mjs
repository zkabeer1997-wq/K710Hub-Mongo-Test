import { sniffImageType } from './interestUploadLimits.mjs';

/**
 * Decode a stored `data:image/...;base64,...` URL into bytes, but only when the
 * payload really is the image type it claims (magic-byte check). Returns null
 * for anything else so on-demand image endpoints never serve mislabelled data.
 * @returns {{ type: string, bytes: Buffer } | null}
 */
export function decodeImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== match[1]) return null;
  return { type: sniffed, bytes };
}

export function imageResponse(decoded) {
  return new Response(decoded.bytes, {
    status: 200,
    headers: {
      'Content-Type': decoded.type,
      'Content-Length': String(decoded.bytes.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    },
  });
}
