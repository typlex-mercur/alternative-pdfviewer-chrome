// SmoothPDF Background Service Worker (Manifest V3)

const RULE_ID_REDIRECT_PDF = 1;
const RULE_ID_ALLOW_DOWNLOAD = 2;

// Setup declarativeNetRequest redirect rules for HTTP/HTTPS web PDFs
async function setupRedirectRules() {
  try {
    const res = await chrome.storage.local.get(['autoRedirect']);
    if (res.autoRedirect === false) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID_REDIRECT_PDF, RULE_ID_ALLOW_DOWNLOAD]
      });
      console.log('[SmoothPDF] Auto redirect is disabled, redirect rules removed.');
      return;
    }

    const viewerBaseUrl = chrome.runtime.getURL('viewer/viewer.html');

    // Rule 1: Redirect web PDF links to SmoothPDF viewer (Priority 1)
    const redirectRule = {
      id: RULE_ID_REDIRECT_PDF,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: `${viewerBaseUrl}?file=\\0`
        }
      },
      condition: {
        regexFilter: '^https?:\\/\\/[^?#]+\\.[pP][dD][fF]($|[?#])',
        resourceTypes: ['main_frame']
      }
    };

    // Rule 2: Allow direct downloads (S3, Canvas LMS, Cloud presigned URLs) without redirect (Priority 2)
    const allowDownloadRule = {
      id: RULE_ID_ALLOW_DOWNLOAD,
      priority: 2,
      action: {
        type: 'allow'
      },
      condition: {
        regexFilter: '(?:[?&]|%26|%3[fF])(?:response-content-disposition|disposition|download_frd|export=download|action=download|download=)',
        resourceTypes: ['main_frame']
      }
    };

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID_REDIRECT_PDF, RULE_ID_ALLOW_DOWNLOAD],
      addRules: [redirectRule, allowDownloadRule]
    });
    console.log('[SmoothPDF] Dynamic PDF redirect & allow-download rules registered successfully.');
  } catch (err) {
    console.warn('[SmoothPDF] Failed to register dynamic rules:', err);
  }
}

// Immediately initialize redirect rules when service worker script evaluates
setupRedirectRules().catch((err) => {
  console.warn('[SmoothPDF] Initial rule setup failed:', err);
});

// Lifecycle events
chrome.runtime.onInstalled.addListener(async () => {
  await setupRedirectRules();

  // Create context menu for links
  try {
    chrome.contextMenus.create({
      id: 'smoothpdf-open-link',
      title: 'Mở bằng SmoothPDF (Cuộn mượt)',
      contexts: ['link']
    });
  } catch (e) {}

  // Set default settings
  chrome.storage.local.get(['autoRedirect', 'smoothScroll', 'damping', 'theme'], (res) => {
    const defaults = {
      autoRedirect: true,
      smoothScroll: true,
      damping: 0.18,
      theme: 'theme-light'
    };
    chrome.storage.local.set({ ...defaults, ...res });
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await setupRedirectRules();
});

// Helper: Check if URL is an explicit download / attachment (S3, Canvas, cloud presigned)
function isPdfDownloadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();

  // 1. S3 / Cloud presigned download parameters (e.g. response-content-disposition=attachment)
  if (
    lower.includes('response-content-disposition=attachment') ||
    lower.includes('response-content-disposition%3dattachment') ||
    lower.includes('response-content-disposition')
  ) {
    return true;
  }

  // 2. Common download query parameters
  if (
    lower.includes('disposition=attachment') ||
    lower.includes('disposition%3dattachment') ||
    lower.includes('download_frd=1') ||
    lower.includes('download=1') ||
    lower.includes('download=true') ||
    lower.includes('action=download')
  ) {
    return true;
  }

  return false;
}

// Helper: Determine if URL is a valid PDF to redirect
function isPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Never redirect our own viewer to avoid infinite loops
  const viewerBase = chrome.runtime.getURL('viewer/viewer.html');
  if (url.startsWith(viewerBase)) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('about:')) return false;

  // Never redirect URLs that are explicit file downloads
  if (isPdfDownloadUrl(url)) {
    console.log('[SmoothPDF] Bypassing redirect for download URL:', url);
    return false;
  }

  // Check extension or query parameter
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.pdf')) return true;
    if (parsed.searchParams && parsed.searchParams.get('file')) {
      const f = parsed.searchParams.get('file').toLowerCase();
      if (f.endsWith('.pdf')) return true;
    }
  } catch (e) {
    const cleanUrl = url.split(/[?#]/)[0].toLowerCase();
    if (cleanUrl.endsWith('.pdf')) return true;
  }

  return false;
}

// Helper: Redirect a tab to the smooth viewer
function redirectToViewer(tabId, url) {
  if (!isPdfUrl(url)) return;

  chrome.storage.local.get(['autoRedirect'], (res) => {
    const isWeb = url.startsWith('http://') || url.startsWith('https://');
    if (isWeb && res.autoRedirect === false) {
      return;
    }

    const viewerUrl = chrome.runtime.getURL(`viewer/viewer.html?file=${encodeURIComponent(url)}`);
    chrome.tabs.update(tabId, { url: viewerUrl });
    console.log(`[SmoothPDF] Intercepted PDF: ${url} -> redirected to viewer.`);
  });
}

// 1. Intercept via webNavigation (Catches file:/// and web navigations before renderer loads)
if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0 && details.url && isPdfUrl(details.url)) {
      redirectToViewer(details.tabId, details.url);
    }
  });
}

// 2. Intercept via tabs.onUpdated (Catches URL changes, dragged files, typed URLs)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url || changeInfo.pendingUrl;
  if (targetUrl && isPdfUrl(targetUrl)) {
    redirectToViewer(tabId, targetUrl);
  }
});

// 3. Intercept via tabs.onCreated (Catches files dragged into the Chrome tab bar)
chrome.tabs.onCreated.addListener((tab) => {
  const targetUrl = tab.url || tab.pendingUrl;
  if (targetUrl && isPdfUrl(targetUrl)) {
    redirectToViewer(tab.id, targetUrl);
  }
});

// 4. Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'smoothpdf-open-link' && info.linkUrl) {
    const viewerUrl = chrome.runtime.getURL(`viewer/viewer.html?file=${encodeURIComponent(info.linkUrl)}`);
    chrome.tabs.create({ url: viewerUrl, index: (tab && tab.index !== undefined) ? tab.index + 1 : undefined });
  }
});

// 5. Message listener for proxying CORS PDF fetches, direct downloads, or settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadPdfDirectly') {
    const downloadOptions = {
      url: request.url,
      saveAs: false
    };
    if (request.filename) {
      downloadOptions.filename = request.filename;
    }
    chrome.downloads.download(downloadOptions, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.warn('[SmoothPDF] Direct download failed:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[SmoothPDF] Direct download started, id:', downloadId);
        sendResponse({ success: true, downloadId });
      }

      if (request.closeTab && sender && sender.tab && sender.tab.id) {
        setTimeout(() => {
          chrome.tabs.remove(sender.tab.id, () => {
            if (chrome.runtime.lastError) {}
          });
        }, 150);
      }
    });
    return true;
  }

  if (request.action === 'checkContentDisposition') {
    fetch(request.url, { method: 'HEAD' })
      .then((res) => {
        const disposition = res.headers.get('content-disposition') || '';
        const isAttachment = disposition.toLowerCase().includes('attachment');
        let filename = '';
        const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;"']+)['"]?/i);
        if (match && match[1]) {
          try {
            filename = decodeURIComponent(match[1].trim());
          } catch (e) {
            filename = match[1].trim();
          }
        }
        sendResponse({ isAttachment, filename });
      })
      .catch(() => {
        sendResponse({ isAttachment: false });
      });
    return true;
  }

  if (request.action === 'fetchPdf') {
    fetch(request.url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        // Check if server marked this as an attachment download
        const disposition = response.headers.get('content-disposition') || '';
        if (disposition.toLowerCase().includes('attachment')) {
          let filename = '';
          const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;"']+)['"]?/i);
          if (match && match[1]) {
            try {
              filename = decodeURIComponent(match[1].trim());
            } catch (e) {
              filename = match[1].trim();
            }
          }
          chrome.downloads.download({ url: request.url, filename: filename || undefined, saveAs: false });
          if (sender && sender.tab && sender.tab.id) {
            chrome.tabs.remove(sender.tab.id, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          sendResponse({ success: true, isAttachment: true });
          return;
        }

        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Không thể đọc blob thành dữ liệu Data URL' });
        };
        reader.readAsDataURL(blob);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'checkFileAccess') {
    chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
      sendResponse({ isAllowed: Boolean(isAllowed) });
    });
    return true;
  }

  if (request.action === 'openExtensionSettings') {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'toggleAutoRedirect') {
    setupRedirectRules();
    sendResponse({ success: true });
    return true;
  }
});
