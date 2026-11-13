/**
 * Compresses an image file or data URL to optimize storage and reduce Firestore payload size.
 * Resizes max dimension to 800px and encodes as JPEG with 0.75 quality (~50KB).
 */
export function compressImage(fileOrDataUrl: File | string, maxWidth = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const processImage = (src: string) => {
      img.src = src;
    };

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = err => {
      console.warn('Image compression warning:', err);
      if (typeof fileOrDataUrl === 'string') {
        resolve(fileOrDataUrl);
      } else {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(fileOrDataUrl);
      }
    };

    if (fileOrDataUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = e => processImage(e.target?.result as string);
      reader.onerror = err => reject(err);
      reader.readAsDataURL(fileOrDataUrl);
    } else if (typeof fileOrDataUrl === 'string') {
      processImage(fileOrDataUrl);
    } else {
      reject(new Error('Invalid image input'));
    }
  });
}
