import React, { useState } from "react";
import imageCompression from "browser-image-compression";
import "./App.css";

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [compressedImage, setCompressedImage] = useState(null);
  const [targetSizeMB, setTargetSizeMB] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setOriginalImage(file);
      setCompressedImage(null);
    }
  };

  const handleResize = async () => {
    if (!originalImage || !targetSizeMB) return;
    setLoading(true);
    try {
      const targetSizeBytes = targetSizeMB * 1024 * 1024;
      let quality = 1.0;
      let compressedFile = originalImage;

      while (compressedFile.size > targetSizeBytes && quality > 0.05) {
        const options = {
          maxSizeMB: targetSizeMB,
          maxWidthOrHeight: 4000,
          useWebWorker: true,
          initialQuality: quality,
        };
        compressedFile = await imageCompression(originalImage, options);
        quality -= 0.05;
      }

      setCompressedImage(compressedFile);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (compressedImage) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(compressedImage);
      link.download = `resized_${compressedImage.name}`;
      link.click();
    }
  };

  return (
    <div className="container">
      <h1>HD Image Resizer 🔧</h1>

      <div className="card">
        <input type="file" accept="image/*" onChange={handleImageUpload} />

        {originalImage && (
          <>
            <img
              src={URL.createObjectURL(originalImage)}
              alt="Original"
              className="preview"
            />
            <p>
              Original Size:{" "}
              {(originalImage.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </>
        )}

        <input
          type="number"
          value={targetSizeMB}
          onChange={(e) => setTargetSizeMB(e.target.value)}
          placeholder="Enter target size (MB)"
        />

        <button
          onClick={handleResize}
          disabled={loading || !originalImage}
          className="resize-btn"
        >
          {loading ? "Processing..." : "Resize Image"}
        </button>

        {compressedImage && (
          <div className="result">
            <h3>Resized Image:</h3>
            <img
              src={URL.createObjectURL(compressedImage)}
              alt="Compressed"
              className="preview"
            />
            <p>
              New Size: {(compressedImage.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <button onClick={handleDownload} className="download-btn">
              Download Resized Image
            </button>
          </div>
        )}
      </div>

      <footer>Made with ❤️ by Kunj Khanpara</footer>
    </div>
  );
}

export default App;
