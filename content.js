// SmoothPDF Content Script - Download Detection & Passthrough Engine
// Intercepts explicit "Download PDF" actions on webpages and routes them directly
// to Chrome's native download manager, preventing unwanted reader redirects.

(function () {
  'use strict';

  // Canvas LMS (VNU / Instructure) Protection Engine:
  // Automatically blocks heavy in-page CanvaDocs preview iframes that crash Chrome on 100MB+ / 900-page textbooks!
  function initCanvasLmsGuard() {
    const host = window.location.hostname.toLowerCase();
    const isLms = host.includes('uet.vnu.edu.vn') || host.includes('vnu.edu.vn') || host.includes('instructure.com');
    if (!isLms) return;

    // Check if this is a file view page
    const path = window.location.pathname.toLowerCase();
    const isFilePage = path.includes('/files/') || path.includes('/modules/items/');
    if (!isFilePage) return;

    const blockPreview = () => {
      // Find CanvaDocs / LMS preview iframes
      const iframes = document.querySelectorAll(
        'iframe.canvadocs_iframe, iframe#doc_preview, iframe#file_preview, iframe[src*="viewer.html"], iframe[src*="canvadoc"], iframe[src*="/preview"]'
      );

      iframes.forEach((frame) => {
        const src = (frame.getAttribute('src') || '').toLowerCase();
        if (src.includes('chrome-extension://')) return;

        console.log('[SmoothPDF] Đã chặn iframe xem trước của Canvas LMS để bảo vệ bộ nhớ hệ thống.');
        const parent = frame.parentElement;
        frame.remove();

        if (parent && !parent.querySelector('.smoothpdf-lms-guard-banner')) {
          const downloadUrl = `${window.location.href.split(/[?#]/)[0]}/download?download_frd=1`;
          const banner = document.createElement('div');
          banner.className = 'smoothpdf-lms-guard-banner';
          banner.style.cssText = `
            padding: 30px 20px;
            margin: 20px auto;
            max-width: 760px;
            background: #f8fafc;
            border: 2px dashed #6366f1;
            border-radius: 12px;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          `;
          banner.innerHTML = `
            <div style="font-size: 36px; margin-bottom: 10px;">⚡</div>
            <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #0f172a; font-weight: 700;">
              SmoothPDF: Đã chặn chế độ nạp trước của LMS để bảo vệ RAM
            </h3>
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.5;">
              Tài liệu này có thể có dung lượng rất lớn (ví dụ: sách giáo trình 150 MB / gần 900 trang).<br/>
              Trình đọc mặc định của LMS sẽ nạp toàn bộ vào web gây <b>tràn 100% RAM</b> và đơ máy tính.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap;">
              <a href="${downloadUrl}" style="
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 22px;
                background: #4f46e5;
                color: #ffffff;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
              ">
                📥 Tải file trực tiếp về máy (An toàn, không tốn RAM)
              </a>
            </div>
          `;
          parent.appendChild(banner);
        }
      });
    };

    blockPreview();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', blockPreview);
    }
    const observer = new MutationObserver(blockPreview);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  initCanvasLmsGuard();

  const DOWNLOAD_KEYWORDS = [
    'tải về',
    'tải xuống',
    'tải pdf',
    'tải tệp',
    'tải file',
    'tải bản in',
    'tải hóa đơn',
    'tải tài liệu',
    'tải ngay',
    'lưu pdf',
    'lưu về',
    'download',
    'save pdf',
    'export pdf',
    'download pdf',
    'download file'
  ];

  function isDownloadIntent(el) {
    if (!el) return false;

    // 1. Explicit HTML5 download attribute
    if (el.hasAttribute && el.hasAttribute('download')) {
      return true;
    }

    // 2. Text content, aria-label, title, id, or class matching
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();

    for (const kw of DOWNLOAD_KEYWORDS) {
      if (
        text.includes(kw) ||
        aria.includes(kw) ||
        title.includes(kw) ||
        id.includes(kw)
      ) {
        return true;
      }
    }

    if (className.includes('download') || className.includes('btn-download') || className.includes('instructure_file_link')) {
      return true;
    }

    // 3. Canvas LMS, Google Drive, or Cloud download URLs
    const href = (el.getAttribute && (el.getAttribute('href') || el.dataset?.url || '')) || '';
    const hrefLower = href.toLowerCase();
    if (
      hrefLower.includes('download_frd=1') ||
      hrefLower.includes('response-content-disposition') ||
      hrefLower.includes('disposition=attachment') ||
      (hrefLower.includes('/files/') && hrefLower.includes('/download'))
    ) {
      return true;
    }

    return false;
  }

  function isPdfTarget(href, downloadAttr, targetEl) {
    if (downloadAttr && downloadAttr.toLowerCase().endsWith('.pdf')) {
      return true;
    }

    if (targetEl) {
      const title = (targetEl.getAttribute('title') || '').toLowerCase();
      const text = (targetEl.innerText || targetEl.textContent || '').trim().toLowerCase();
      const aria = (targetEl.getAttribute('aria-label') || '').toLowerCase();
      if (title.includes('.pdf') || text.includes('.pdf') || aria.includes('.pdf')) {
        return true;
      }
    }

    if (!href || typeof href !== 'string') return false;

    try {
      const cleanUrl = href.split(/[?#]/)[0].toLowerCase();
      if (cleanUrl.endsWith('.pdf')) return true;

      const parsed = new URL(href, window.location.href);
      if (parsed.pathname.toLowerCase().endsWith('.pdf')) return true;

      // Check query param e.g. file=xxx.pdf or url=xxx.pdf
      for (const val of parsed.searchParams.values()) {
        if (val.toLowerCase().endsWith('.pdf')) return true;
      }
    } catch (e) {
      if (href.toLowerCase().includes('.pdf')) return true;
    }

    return false;
  }

  document.addEventListener(
    'click',
    (e) => {
      // Find closest link or clickable button
      const link = e.target.closest('a');
      const button = e.target.closest('button, [role="button"]');
      const targetEl = link || button;
      if (!targetEl) return;

      const hasDownloadAttr = link && link.hasAttribute('download');
      const hasDownloadText = isDownloadIntent(targetEl) || isDownloadIntent(e.target);

      // Determine href
      let href = link ? link.getAttribute('href') : null;
      if (!href && targetEl.dataset) {
        href = targetEl.dataset.url || targetEl.dataset.href || null;
      }

      // If neither href nor download attribute exists, let default behavior happen
      if (!href && !hasDownloadAttr) return;

      const downloadAttrVal = link ? link.getAttribute('download') : '';
      const isPdf = isPdfTarget(href, downloadAttrVal, targetEl);

      // If user clicked a PDF link that has download intent or download attribute
      if (isPdf && (hasDownloadAttr || hasDownloadText)) {
        // Skip blob: and data: URLs (browser handles these natively)
        if (href && (href.startsWith('blob:') || href.startsWith('data:'))) {
          return;
        }

        // Skip interception for URLs with native download parameters
        // (e.g. Canvas LMS download_frd=1) — let browser handle natively
        if (href) {
          const hrefLower = href.toLowerCase();
          if (
            hrefLower.includes('download_frd=') ||
            hrefLower.includes('response-content-disposition') ||
            hrefLower.includes('disposition=attachment') ||
            (hrefLower.includes('/files/') && hrefLower.includes('/download'))
          ) {
            return;
          }
        }

        try {
          const absoluteUrl = href ? new URL(href, window.location.href).href : null;
          if (absoluteUrl) {
            e.preventDefault();
            e.stopPropagation();

            // Sanitize download attribute: ignore boolean-like values
            const BOOLEAN_LIKE = ['true', 'false', 'download', 'undefined', 'null', ''];
            let filename = '';
            if (downloadAttrVal && !BOOLEAN_LIKE.includes(downloadAttrVal.toLowerCase())) {
              filename = downloadAttrVal;
            }

            // Fallback: extract from title or text if it looks like a .pdf filename
            if (!filename && targetEl) {
              const title = targetEl.getAttribute('title');
              if (title && title.toLowerCase().endsWith('.pdf')) {
                filename = title;
              } else {
                const text = (targetEl.innerText || targetEl.textContent || '').trim();
                if (text && text.toLowerCase().endsWith('.pdf') && text.length < 260) {
                  filename = text;
                }
              }
            }

            chrome.runtime.sendMessage({
              action: 'downloadPdfDirectly',
              url: absoluteUrl,
              filename: filename
            });

            return;
          }
        } catch (err) {
          // If URL parsing fails, let standard navigation proceed
        }
      }
    },
    true // Capture phase: intercepts before page scripts or default navigation
  );
})();
