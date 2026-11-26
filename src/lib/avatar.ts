export const MAX_PHOTO_URL_LENGTH = 120000;
export const MAX_AVATAR_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB

const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function isSafeAvatarUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_PHOTO_URL_LENGTH) return false;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
  return SAFE_DATA_IMAGE_RE.test(trimmed);
}

export async function compressProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a PNG, JPG, WebP, or GIF image file.');
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error('Image is larger than 20 MB. Please select a smaller image.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode the selected image.'));
      el.src = objectUrl;
    });

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Selected image has invalid dimensions.');
    }

    // Center-crop to a square so profile avatars look clean everywhere
    const cropSize = Math.min(sourceWidth, sourceHeight);
    const sx = Math.floor((sourceWidth - cropSize) / 2);
    const sy = Math.floor((sourceHeight - cropSize) / 2);

    const dimensions = [256, 192, 144];
    const qualities = [0.85, 0.72, 0.58];

    for (const targetSize of dimensions) {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Browser canvas is unavailable for image resizing.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= MAX_PHOTO_URL_LENGTH && SAFE_DATA_IMAGE_RE.test(dataUrl)) {
          return dataUrl;
        }
      }
    }

    throw new Error('Compressed image is still too large. Try a simpler or smaller picture.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
