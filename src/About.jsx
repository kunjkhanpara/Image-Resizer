import React from "react";
import "./App.css";

export default function About({ onBack, theme }) {
  return (
    <div className={`page ${theme}`}>
      <header className="header">
        <h1>ℹ️ About Image Resizer Studio</h1>
        <div className="header-right">
          <button className="about-btn" onClick={onBack}>
            ⬅ Back
          </button>
        </div>
      </header>

      <main className="about-content">
        <section>
          <h2>🖼️ What is Image Resizer Studio?</h2>
          <p>
            Image Resizer Studio is a <strong>free, browser-based image resizing tool </strong> 
            that helps you easily reduce image size (in MB) or adjust dimensions 
            (width × height) with top HD quality — directly in your browser, no upload needed.
          </p>
        </section>

        <section>
          <h2>⚙️ How to Use</h2>
          <ol>
            <li>Click or drag & drop your images into the upload area.</li>
            <li>
              Choose one or both resize options:
              <ul>
                <li><b>Resize by MB:</b> Enter your target size, e.g. 5 MB.</li>
                <li><b>Resize by Dimensions:</b> Enter custom width & height in px, mm, cm, or inch.</li>
              </ul>
            </li>
            <li>Click <b>Start Resizing</b> to process the images.</li>
            <li>Preview and click <b>Download All</b> to save your resized images.</li>
          </ol>
        </section>

        <section>
          <h2>💡 Key Features</h2>
          <ul>
            <li>✅ Resize by MB, by Dimensions, or both simultaneously.</li>
            <li>⚡ Fast GPU-accelerated performance with Web Workers.</li>
            <li>🖼️ Maintains top-level visual clarity and HD quality.</li>
            <li>🔒 100% Private — all processing happens in your browser.</li>
            <li>💰 Completely Free — no limits, no ads, no watermarks!</li>
          </ul>
        </section>

        <section>
          <h2>⭐ Support & Feedback</h2>
          <p>
            If you like this project, please give it a{" "}
            <a
              href="https://kunjkhanpara.github.io/Kunj_Khanpara_Portfolio/"
              target="_blank"
              rel="noreferrer"
            >
              ⭐ star on GitHub
            </a>
            !
          </p>
          <p>
            Have suggestions or feature ideas?  
            Share your thoughts or open an issue on GitHub:
          </p>
          <p>
            <a
              href="https://github.com/kunjkhanpara/Image-Resizer"
              target="_blank"
              rel="noreferrer"
              className="github-link"
            >
              🔗 github.com/kunjkhanpara/Image-Resizer
            </a>
          </p>
        </section>

        <section className="footer">
          <p>
            Made with ❤️ by{" "}
            <a href="https://kunjkhanpara.github.io/" target="_blank" rel="noreferrer">
              Kunj Khanpara
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
