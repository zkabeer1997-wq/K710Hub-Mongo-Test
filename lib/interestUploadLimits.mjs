export const INTEREST_UPLOAD_LIMITS = Object.freeze({
  maxFiles: 4,
  maxSourceBytes: 12 * 1024 * 1024,
  maxProcessedBytes: 900 * 1024,
  maxCombinedBytes: 3.2 * 1024 * 1024,
  maxDimension: 1920,
});

export const INTEREST_UPLOAD_ACCEPT = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);
const PROCESSED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function fileExtension(name = '') {
  const extension = String(name).split('.').pop()?.toLowerCase();
  return extension === String(name).toLowerCase() ? '' : extension;
}

export function isHeicFile(file) {
  return file?.type === 'image/heic'
    || file?.type === 'image/heif'
    || HEIC_EXTENSIONS.has(fileExtension(file?.name));
}

export function isAcceptedInterestImage(file) {
  return INTEREST_UPLOAD_ACCEPT.includes(file?.type)
    || ACCEPTED_EXTENSIONS.has(fileExtension(file?.name));
}

export function validateInterestSourceFiles(files) {
  if (!files.length) return 'Choose at least one screenshot.';
  if (files.length > INTEREST_UPLOAD_LIMITS.maxFiles) {
    return `Upload no more than ${INTEREST_UPLOAD_LIMITS.maxFiles} screenshots.`;
  }

  const unsupported = files.find((file) => !isAcceptedInterestImage(file));
  if (unsupported) {
    return `${unsupported.name || 'One file'} is not supported. Use JPG, PNG, WebP, HEIC, or HEIF.`;
  }

  const oversized = files.find((file) => file.size > INTEREST_UPLOAD_LIMITS.maxSourceBytes);
  if (oversized) {
    return `${oversized.name || 'One file'} is larger than 12 MB. Choose a smaller screenshot.`;
  }

  return '';
}

export function validateProcessedInterestFiles(files) {
  if (files.some((file) => !PROCESSED_TYPES.has(file.type))) {
    return 'One image could not be converted to a supported upload format.';
  }
  const oversized = files.find((file) => file.size > INTEREST_UPLOAD_LIMITS.maxProcessedBytes);
  if (oversized) return 'One screenshot could not be compressed enough. Crop it slightly and try again.';

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > INTEREST_UPLOAD_LIMITS.maxCombinedBytes) {
    return 'The screenshots are still too large together. Upload fewer images or crop them and try again.';
  }

  return '';
}

/**
 * Magic-byte sniffing. A declared Content-Type / file name is attacker
 * controlled, so uploads are accepted only when the leading bytes match a real
 * JPEG, PNG, WebP or GIF header.
 * @param {Uint8Array | Buffer} bytes
 * @returns {'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null}
 */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  return null;
}

/** True when `bytes` really are an image of the declared MIME type. */
export function bytesMatchImageType(bytes, declaredType) {
  const sniffed = sniffImageType(bytes);
  return Boolean(sniffed) && sniffed === declaredType;
}
