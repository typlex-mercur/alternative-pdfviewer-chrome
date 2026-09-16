document.addEventListener('DOMContentLoaded', async () => {
  const autoRedirectToggle = document.getElementById('autoRedirectToggle');
  const smoothScrollToggle = document.getElementById('smoothScrollToggle');
  const dampingSlider = document.getElementById('dampingSlider');
  const dampingLabel = document.getElementById('dampingLabel');
  const btnOpenViewer = document.getElementById('btnOpenViewer');
  const fileAccessWarning = document.getElementById('fileAccessWarning');
  const btnFixFileAccess = document.getElementById('btnFixFileAccess');

  // Check file scheme permission
  if (chrome && chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
    chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
      if (!isAllowed && fileAccessWarning) {
        fileAccessWarning.classList.remove('hidden');
      }
    });
  }

  if (btnFixFileAccess) {
    btnFixFileAccess.addEventListener('click', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
  }

  // Load saved settings
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['autoRedirect', 'smoothScroll', 'damping'], (res) => {
      if (res.autoRedirect !== undefined) autoRedirectToggle.checked = res.autoRedirect;
      if (res.smoothScroll !== undefined) smoothScrollToggle.checked = res.smoothScroll;
      if (res.damping !== undefined) {
        dampingSlider.value = res.damping;
        updateDampingText(res.damping);
      }
    });
  }

  function updateDampingText(val) {
    const num = parseFloat(val);
    let desc = 'Cân bằng';
    if (num <= 0.12) desc = 'Êm dịu (Chậm)';
    else if (num <= 0.22) desc = 'Mượt mà Edge-like (Khuyên dùng)';
    else desc = 'Nhanh nhạy';
    dampingLabel.textContent = `${desc} (${num})`;
  }

  autoRedirectToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ autoRedirect: enabled });
    chrome.runtime.sendMessage({ action: 'toggleAutoRedirect', enabled });
  });

  smoothScrollToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ smoothScroll: e.target.checked });
  });

  dampingSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateDampingText(val);
    chrome.storage.local.set({ damping: val });
  });

  btnOpenViewer.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer/viewer.html') });
  });
});
