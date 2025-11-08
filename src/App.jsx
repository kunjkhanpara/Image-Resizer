import React, { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import "./App.css";
import imageCompression from "browser-image-compression";
import { set, get, del } from "idb-keyval";
import About from "./About";

export default function App() {
  const [theme, setTheme] = useState("light");
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [showAbout, setShowAbout] = useState(false);

  // Resize options
  const [useMB, setUseMB] = useState(false);
  const [useDimension, setUseDimension] = useState(false);
  const [targetSize, setTargetSize] = useState("");
  const [sizeUnit, setSizeUnit] = useState("MB");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("px");

  // Restore from IndexedDB
  useEffect(() => {
    (async () => {
      const stored = await get("savedImages");
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setFiles(stored);
        setSelectedFiles(stored.map((_, i) => i));
      }
    })();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    accept: { "image/*": [] },
    onDrop: async (accepted) => {
      const newFiles = [...files, ...accepted];
      setFiles(newFiles);
      setSelectedFiles(newFiles.map((_, i) => i));
      await set("savedImages", newFiles);
    },
  });

  const convertToPx = (val) => {
    if (unit === "px") return val;
    const dpi = 96;
    switch (unit) {
      case "inch":
        return val * dpi;
      case "cm":
        return (val / 2.54) * dpi;
      case "mm":
        return (val / 25.4) * dpi;
      default:
        return val;
    }
  };

  const showAlert = (msg) => alert(msg);

  const startCompression = async () => {
    if (!selectedFiles.length)
      return showAlert("Please select at least one image to resize!");
    if (!useMB && !useDimension)
      return showAlert("Please select at least one resize option!");
    if (useDimension && (!width || !height))
      return showAlert("Please enter both width and height!");
    if (useMB && !targetSize)
      return showAlert("Please enter target size!");

    setRunning(true);
    setResults([]);
    const out = [];

    for (let i = 0; i < files.length; i++) {
      if (!selectedFiles.includes(i)) continue;
      const file = files[i];
      let processedFile = file;

      // Resize by dimension
      if (useDimension && width && height) {
        const w = convertToPx(Number(width));
        const h = convertToPx(Number(height));
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        processedFile = await new Promise((resolve) =>
          canvas.toBlob(
            (b) => resolve(new File([b], file.name, { type: file.type })),
            file.type,
            0.9
          )
        );
      }

      // Resize by MB/KB
      if (useMB && targetSize) {
        processedFile = await compressAccurate(processedFile, targetSize, sizeUnit, i);
      }

      out.push({ originalIndex: i, file: processedFile });
      setProgressMap((p) => ({ ...p, [i]: 100 }));
    }

    setResults(out);
    setRunning(false);
  };

  const compressAccurate = async (file, targetValue, unitType, i) => {
  // Convert to bytes
  const targetBytes =
    unitType === "MB" ? targetValue * 1024 * 1024 : targetValue * 1024;

  // set min quality dynamically based on mode
  const minQuality = unitType === "MB" ? 0.5 : 0.05;
  const maxTries = 15;
  let low = minQuality,
    high = 1.0,
    best = file,
    bestDiff = Infinity,
    tries = 0;

  // --- Phase 1: Binary Search Compression ---
  while (low <= high && tries < maxTries) {
    const q = (low + high) / 2;
    const compressed = await imageCompression(file, {
      useWebWorker: true,
      initialQuality: q,
      maxWidthOrHeight: 5000,
    });

    const diff = Math.abs(compressed.size - targetBytes);

    if (diff < bestDiff) {
      best = compressed;
      bestDiff = diff;
    }

    if (compressed.size > targetBytes) high = q - 0.03;
    else low = q + 0.03;

    tries++;
    setProgressMap((p) => ({ ...p, [i]: (tries / maxTries) * 100 }));
  }

  // --- Phase 2: Fine-Tuning for KB Mode ---
  if (unitType === "KB" && best.size > targetBytes * 1.05) {
    let pass = 0;
    let temp = best;
    while (temp.size > targetBytes && pass < 5) {
      const ratio = targetBytes / temp.size;
      const nextQ = Math.max(minQuality, ratio * 0.8);
      const reComp = await imageCompression(file, {
        useWebWorker: true,
        initialQuality: nextQ,
        maxWidthOrHeight: 5000,
      });
      if (reComp.size < temp.size) temp = reComp;
      pass++;
    }
    best = temp;
  }

  // --- MB Mode Adjustment: Keep near-perfect HD ---
  if (unitType === "MB") {
    // if it's below 85% of target, slightly boost quality
    if (best.size < targetBytes * 0.85) {
      const qualityBoost = Math.min(1, (best.size / targetBytes) + 0.2);
      const boosted = await imageCompression(file, {
        useWebWorker: true,
        initialQuality: qualityBoost,
        maxWidthOrHeight: 5000,
      });
      if (boosted.size > best.size && boosted.size <= targetBytes * 1.05) {
        best = boosted;
      }
    }
  }

  return best;
};



  const toggleSelect = (index) => {
    if (selectedFiles.includes(index)) {
      setSelectedFiles(selectedFiles.filter((i) => i !== index));
    } else {
      setSelectedFiles([...selectedFiles, index]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length) setSelectedFiles([]);
    else setSelectedFiles(files.map((_, i) => i));
  };

  const downloadFile = (file) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `resized_${file.name}`;
    link.click();
  };

  const downloadAll = () => {
    results.forEach(({ file }) => downloadFile(file));
  };

  const clearAll = async () => {
    setFiles([]);
    setResults([]);
    setSelectedFiles([]);
    await del("savedImages");
    alert("Cleared saved images successfully!");
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (showAbout) return <About onBack={() => setShowAbout(false)} theme={theme} />;

  return (
    <div className={`page ${theme}`}>
      <header className="header">
        <h1>🖼️ Pro Image Resizer Studio</h1>
        <div className="header-right">
          <button className="about-btn" onClick={() => setShowAbout(true)}>
            ℹ️ About
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </header>

      <main className="main">
        <motion.div
          className={`dropzone ${isDragActive ? "active" : ""}`}
          {...getRootProps()}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <input {...getInputProps()} />
          {isDragActive ? <p>Drop files here…</p> : <p>Drag & drop or click to upload images</p>}
        </motion.div>

        <div className="mode-toggle">
          <label>
            <input type="checkbox" checked={useMB} onChange={() => setUseMB(!useMB)} />
            Resize by Size (MB / KB)
          </label>
          <label>
            <input
              type="checkbox"
              checked={useDimension}
              onChange={() => setUseDimension(!useDimension)}
            />
            Resize by Dimensions
          </label>
        </div>

        {useMB && (
          <div className="controls">
            <input
              type="number"
              placeholder={`Target size (${sizeUnit})`}
              value={targetSize}
              onChange={(e) => setTargetSize(e.target.value)}
            />
            <select
              value={sizeUnit}
              onChange={(e) => setSizeUnit(e.target.value)}
              style={{ marginLeft: "8px", padding: "0.4rem" }}
            >
              <option value="MB">MB</option>
              <option value="KB">KB</option>
            </select>
          </div>
        )}

        {useDimension && (
          <div className="dimension-controls">
            <div className="dim-group">
              <input
                type="number"
                placeholder="Width"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
              <span>×</span>
              <input
                type="number"
                placeholder="Height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="px">px</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="select-control">
            <button onClick={toggleSelectAll} className="select-all-btn">
              {selectedFiles.length === files.length ? "Deselect All" : "Select All"}
            </button>
          </div>
        )}

        <button onClick={startCompression} disabled={running || !files.length}>
          {running ? "Processing…" : "Start Resizing"}
        </button>

        <button
          onClick={clearAll}
          disabled={running}
          style={{ marginTop: "0.5rem", background: "#ff5b5b", color: "#fff" }}
        >
          Clear All
        </button>

        {files.length > 0 && (
          <div className="grid">
            {files.map((f, i) => (
              <div
                key={i}
                className={`card ${selectedFiles.includes(i) ? "selected" : ""}`}
                onClick={() => toggleSelect(i)}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(i)}
                  readOnly
                  className="checkbox small"
                />
                <img src={URL.createObjectURL(f)} alt={f.name} />
                <span>{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="resized-header">
              <h2>Resized Images</h2>
              <button className="download-all" onClick={downloadAll}>
                Download All
              </button>
            </div>
            <div className="grid">
              {results.map(({ file }, i) => (
                <div key={i} className="card">
                  <img src={URL.createObjectURL(file)} alt={file.name} />
                  <span>{formatSize(file.size)}</span>
                  <button className="download-single" onClick={() => downloadFile(file)}>
                    Download
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        Made with ❤️ by{" "}
        <a href="https://kunjkhanpara.github.io/" target="_blank" rel="noreferrer">
          Kunj Khanpara
        </a>
      </footer>
    </div>
  );
}
