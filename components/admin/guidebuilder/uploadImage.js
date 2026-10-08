export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function checkImageFile(file) {
  if (!file || !IMAGE_TYPES.includes(file.type)) return `"${file?.name || 'That file'}" is not a JPG, PNG, WebP or GIF image.`;
  if (!file.size) return `"${file.name}" is empty.`;
  if (file.size > MAX_IMAGE_BYTES) return `"${file.name}" is larger than 3 MB. Resize it and try again.`;
  return '';
}

// XMLHttpRequest rather than fetch so the builder can show real upload progress.
export function uploadGuideImage(file, guideSlug, onProgress) {
  return new Promise((resolve, reject) => {
    const problem = checkImageFile(file);
    if (problem) { reject(new Error(problem)); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin-guide-images');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onerror = () => reject(new Error('The upload could not reach the server. Check your connection and try again.'));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.src) resolve({ src: body.src });
      else if (xhr.status === 401) reject(new Error('Your admin session expired. Sign in again, then retry the upload.'));
      else reject(new Error(body.error || 'The photo could not be uploaded. Please try again.'));
    };
    const data = new FormData();
    data.append('file', file);
    data.append('guide', guideSlug);
    data.append('compact', '1');
    xhr.send(data);
  });
}
