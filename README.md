# SmoothPDF - Alternative PDF Viewer for Google Chrome

> **A high-performance, Edge-like buttery smooth PDF reader for Google Chrome.**
> Featuring 60–120 FPS momentum scrolling, GPU-accelerated instant zooming, distraction-free minimalist UI, full-text in-page search, authentic dark/sepia reading modes, and intelligent direct-download protection.

---

## 🚀 Why SmoothPDF?

### The Problem with Chrome's Default PDF Viewer
- **Choppy Scrolling**: Google Chrome's built-in PDF reader (PDFium) jumps in rigid 100–120px increments per mouse wheel tick, often stuttering or showing white checkerboard tiles during fast scrolls.
- **Why Edge Feels Better**: Microsoft Edge embeds Adobe Acrobat and leverages Windows `DirectManipulation` API with sub-pixel spring-damping physics for natural momentum.
- **Chrome Extension Limitation**: Chrome strictly prohibits injecting scripts into its internal viewer (`chrome-extension://mhjnhmbfikkbkaxmjaemfiihnmoglgrg/`).

### The Solution: SmoothPDF
**SmoothPDF** seamlessly intercepts PDF URLs and dragged files, routing them into an independent, ultra-lightweight viewer powered by **PDF.js Core on a dedicated Web Worker** and a **custom Physics Momentum Scrolling Engine**.

---

## ✨ Key Features

1. **60–120 FPS Momentum Smooth Scrolling**
   - Employs sub-pixel exponential damping (`damping: 0.18`) tuned to replicate Microsoft Edge's gliding feel.
   - Built-in touchpad auto-detection with instant 1:1 tracking (`damping: 0.35`).
   - Compatible with high-refresh-rate gaming monitors (90Hz, 120Hz, 144Hz, 240Hz).
   - Easily toggled off via popup if you use external mouse scrolling utilities.

2. **GPU-Accelerated Instant Zoom**
   - Zoom with `Ctrl + MouseWheel` or keyboard shortcuts: immediate GPU CSS viewport scaling (0ms delay), followed by crisp asynchronous background re-rendering without blocking the UI thread.

3. **Virtual Viewport & Memory Recycling**
   - Renders only visible pages with smart lookahead buffering.
   - Off-screen canvases and rendered tasks are automatically managed to prevent memory leaks, allowing documents with thousands of pages to open smoothly with minimal RAM usage.

4. **Authentic Dark, Light & Charcoal (#3C3C3C) Themes**
   - Instant 3-mode switching: **Light**, **Dark**, and **Charcoal (#3C3C3C)**.
   - The Charcoal (#3C3C3C) mode provides balanced, low-glare reading comfort mimicking Adobe Acrobat & professional dark workstations.
   - Preserves original PDF colors without inverted-negative distortion on images and charts.

5. **In-Page Full-Text Search Engine (Ctrl + F)**
   - Concurrent background text indexing across all pages.
   - Instant search results with live amber highlight badges (`<mark class="find-highlight">`).
   - Active match indicator (`active`) with smooth auto-centering (`scrollIntoView`).
   - Navigate with `Enter` (Next) and `Shift + Enter` (Prev), dismiss cleanly with `Esc`.

6. **Direct Download & LMS Bypass Protection**
   - 4-layer interception guard prevents hijacking direct file downloads.
   - Respects `Content-Disposition: attachment` and signed URLs (Canvas LMS, Amazon S3, Google Drive, Moodle).

7. **Smart Drag & Drop**
   - Drag any `.pdf` file from your desktop directly into Chrome's tab strip or into the reader window.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + MouseWheel` | Smooth GPU-accelerated Zoom in / out |
| `Ctrl + +` / `Ctrl + -` | Zoom in / out by 10% |
| `Ctrl + 0` | Reset zoom to 100% |
| `Ctrl + F` | Open in-page search bar |
| `Enter` / `Shift + Enter` | Go to Next / Previous search match |
| `Esc` | Close search bar & clear highlights |
| `D` | Cycle theme: **Light &rarr; Dark &rarr; Charcoal (#3C3C3C)** |
| `R` | Rotate page clockwise 90° |
| `PageUp` / `PageDown` / `Space` | Smooth scroll by page |
| `Home` / `End` | Smooth jump to start / end of document |
| `Ctrl + P` | Print document |
| `Ctrl + S` | Download PDF to local disk |

---

## 🛠️ Installation Guide

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/typlex-mercur/alternative-pdfviewer-chrome.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
3. In the top-right corner, enable **Developer mode**.
4. Click **Load unpacked** in the top-left corner.
5. Select the project folder (`alternative-pdfviewer-chrome` / `SmoothPDFview`).
6. **Important for Local Files**:
   - On the `SmoothPDF` extension card, click **Details**.
   - Enable **"Allow access to file URLs"**.
   - *(This allows Chrome to open dragged `.pdf` files from your computer using SmoothPDF).*

---

## ⚙️ Configuration & Popup

Click the **SmoothPDF** icon in Chrome's extension bar to customize:
- **Auto Redirect**: Automatically open `.pdf` links using SmoothPDF.
- **Momentum Smooth Scroll**: Toggle the internal smooth scroll engine on/off.
- **Damping Slider**: Adjust scroll smoothness from snappy to edge-like momentum.

---

## 📄 License

MIT License. Free for personal and commercial use.
