// Pre-downscale high-res photos to optimal model size (max 480px)
export const downscaleForAI = async (blob, maxDim = 480) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(blob);
        return;
      }
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((resizedBlob) => resolve(resizedBlob || blob), 'image/jpeg', 0.88);
    };
    img.onerror = () => resolve(blob);
    img.src = url;
  });
};
