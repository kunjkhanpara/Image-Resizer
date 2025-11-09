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
  const [originalFiles, setOriginalFiles] = useState([]);
  const [fileDimensions, setFileDimensions] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [showAbout, setShowAbout] = useState(false);

  const [useMB, setUseMB] = useState(false);
  const [useDimension, setUseDimension] = useState(false);
  const [targetSize, setTargetSize] = useState("");
  const [sizeUnit, setSizeUnit] = useState("MB");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("px");

  // ✅ Warmup Web Worker (for mobile freeze)
  useEffect(() => {
    const warmup = async () => {
      try {
        const blob = new Blob(["warmup"], { type: "image/jpeg" });
        await imageCompression(blob, { maxSizeMB: 0.001, useWebWorker: true });
      } catch {}
    };
    warmup();
  }, []);

  // Restore from IndexedDB
  useEffect(() => {
    (async () => {
      const stored = await get("savedImages");
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setFiles(stored);
        setOriginalFiles(stored);
        setSelectedFiles(stored.map((_, i) => i));
        await extractAllDimensions(stored);
      }
    })();
  }, []);

  const extractAllDimensions = async (fileArray, existingDims = {}) => {
    const promises = fileArray.map(
      (file, index) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              index,
              width: img.width,
              height: img.height,
            });
          };
          img.src = URL.createObjectURL(file);
        })
    );
    const loaded = await Promise.all(promises);
    const newDims = { ...existingDims };
    loaded.forEach(({ index, width, height }) => {
      newDims[index] = { width, height };
    });
    setFileDimensions(newDims);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    accept: { "image/*": [] },
    onDrop: async (accepted) => {
      const newFiles = [...files, ...accepted];
      setFiles(newFiles);
      setOriginalFiles(newFiles);
      setSelectedFiles(newFiles.map((_, i) => i));
      await set("savedImages", newFiles);
      await extractAllDimensions(newFiles);
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

  // ✅ Parallel compression handler
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
    setProgressMap({});
    setResults([]);

    const tasks = originalFiles
      .map((file, i) =>
        selectedFiles.includes(i)
          ? async () => {
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
                    (b) =>
                      resolve(new File([b], file.name, { type: file.type })),
                    file.type,
                    0.9
                  )
                );
              }

              if (useMB && targetSize) {
                processedFile = await compressStrictUnder(
                  file,
                  targetSize,
                  sizeUnit,
                  i
                );
              }

              setProgressMap((p) => ({ ...p, [i]: 100 }));
              return { originalIndex: i, file: processedFile };
            }
          : null
      )
      .filter(Boolean);

    // Run with concurrency limit
    const concurrency = 4;
    const resultsArray = [];
    let index = 0;

    async function runBatch() {
      const batch = tasks.slice(index, index + concurrency);
      if (!batch.length) return;
      const settled = await Promise.allSettled(batch.map((fn) => fn()));
      settled.forEach((res) => {
        if (res.status === "fulfilled") resultsArray.push(res.value);
      });
      index += concurrency;
      await runBatch();
    }

    await runBatch();
    setResults(resultsArray);
    setRunning(false);
  };

  // ✅ Strict size compression (never exceed target)
  const compressStrictUnder = async (file, targetValue, unitType, i) => {
    const targetBytes =
      unitType === "MB" ? targetValue * 1024 * 1024 : targetValue * 1024;

    let quality = 0.9;
    let step = 0.05;
    let best = file;
    let bestSize = file.size;
    let direction = "";

    for (let tries = 0; tries < 18; tries++) {
      const compressed = await imageCompression(file, {
        useWebWorker: true,
        initialQuality: quality,
        maxWidthOrHeight: 6000,
      });

      const size = compressed.size;
      setProgressMap((p) => ({
        ...p,
        [i]: Math.min(100, ((tries + 1) / 18) * 100),
      }));

      if (size <= targetBytes && size > bestSize) {
        best = compressed;
        bestSize = size;
      }

      const ratio = size / targetBytes;

      if (ratio > 1) {
        if (direction === "up") step *= 0.6;
        quality -= step;
        direction = "down";
      } else if (ratio < 0.93) {
        if (direction === "down") step *= 0.6;
        quality += step;
        direction = "up";
      } else break;

      quality = Math.max(0.05, Math.min(1, quality));
    }

    // final safety cap
    let result = best;
    while (result.size > targetBytes) {
      quality = Math.max(0.05, quality - 0.02);
      const reCompressed = await imageCompression(file, {
        useWebWorker: true,
        initialQuality: quality,
        maxWidthOrHeight: 6000,
      });
      if (reCompressed.size <= targetBytes) result = reCompressed;
      else break;
    }

    return result;
  };

  const toggleSelect = (index) =>
    setSelectedFiles((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );

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

  const downloadAll = () => results.forEach(({ file }) => downloadFile(file));

  const clearAll = async () => {
    setFiles([]);
    setOriginalFiles([]);
    setFileDimensions({});
    setResults([]);
    setSelectedFiles([]);
    await del("savedImages");
    alert("Cleared saved images successfully!");
  };

  const formatSize = (bytes) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  if (showAbout)
    return <About onBack={() => setShowAbout(false)} theme={theme} />;

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
          {isDragActive ? (
            <p>Drop files here…</p>
          ) : (
            <p>Drag & drop or click to upload images</p>
          )}
        </motion.div>

        <div className="mode-toggle">
          <label>
            <input
              type="checkbox"
              checked={useMB}
              onChange={() => setUseMB(!useMB)}
            />
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
              {selectedFiles.length === files.length
                ? "Deselect All"
                : "Select All"}
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
                className={`card ${
                  selectedFiles.includes(i) ? "selected" : ""
                }`}
                onClick={() => toggleSelect(i)}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(i)}
                  readOnly
                  className="checkbox small"
                />
                <img src={URL.createObjectURL(f)} alt={f.name} />
                <span>
                  {formatSize(f.size)}
                  {running && progressMap[i]
                    ? ` • ${Math.round(progressMap[i])}%`
                    : ""}
                </span>
                {useDimension && fileDimensions[i] && (
                  <div className="dimensions-text">
                    {fileDimensions[i].width} × {fileDimensions[i].height} px
                  </div>
                )}
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
                  <button
                    className="download-single"
                    onClick={() => downloadFile(file)}
                  >
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
        <a
          href="https://kunjkhanpara.github.io/Kunj_Khanpara_Portfolio/"
          target="_blank"
          rel="noreferrer"
        >
          Kunj Khanpara
        </a>
      </footer>
    </div>
  );
}
