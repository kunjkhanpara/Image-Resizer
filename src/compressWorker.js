import imageCompression from "browser-image-compression";

self.onmessage = async (e) => {
  const { file, targetMB, index } = e.data;
  try {
    const targetBytes = targetMB * 1024 * 1024;
    let low = 0.05, high = 1.0, best = file, bestDiff = Infinity, tries = 0;

    while (low <= high && tries < 12) {
      const q = (low + high) / 2;
      const options = { maxSizeMB: targetMB * 1.1, useWebWorker: true, initialQuality: q };
      const compressed = await imageCompression(file, options);
      const diff = Math.abs(compressed.size - targetBytes);
      if (diff < bestDiff) { best = compressed; bestDiff = diff; }
      if (compressed.size > targetBytes) high = q - 0.02; else low = q + 0.02;
      tries++;
      self.postMessage({ index, progress: Math.min(100, (tries / 12) * 100) });
    }

    self.postMessage({ index, file: best, done: true });
  } catch (err) {
    self.postMessage({ index, error: err.message });
  }
};
