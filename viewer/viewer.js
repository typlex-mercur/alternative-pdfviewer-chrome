/**
 * SmoothPDF Viewer Controller
 * High-performance virtualized PDF rendering with smooth momentum scrolling
 */

// Configure PDF.js Worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
}

class SmoothPdfViewer {
  constructor() {
    this.pdfDoc = null;
    this.pdfUrl = null;
    this.pdfData = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.currentScale = 1.0;
    this.scaleMode = '1'; // 'fit-width', 'fit-page', or numeric string
    this.rotation = 0;
    this.renderedPages = new Set();
    this.renderingTasks = new Map();
    this.pageViewports = new Map();
    this.pageAspectRatios = new Map();
    this._scrollRafId = null;

    // DOM Elements
    this.container = document.getElementById('viewerContainer');
    this.pagesContainer = document.getElementById('pagesContainer');
    this.welcomeScreen = document.getElementById('welcomeScreen');
    this.docTitle = document.getElementById('docTitle');
    this.pageNumberInput = document.getElementById('pageNumberInput');
    this.numPagesSpan = document.getElementById('numPages');
    this.zoomSelect = document.getElementById('zoomSelect');
    this.filePicker = document.getElementById('filePicker');
    this.dropZone = document.getElementById('dropZone');
    this.btnBrowseFile = document.getElementById('btnBrowseFile');
    this.sidebar = document.getElementById('sidebar');
    this.thumbnailsView = document.getElementById('thumbnailsView');
    this.outlineView = document.getElementById('outlineView');
    this.toast = document.getElementById('toast');
    this.findBar = document.getElementById('findBar');
    this.findInput = document.getElementById('findInput');
    this.findMatchCount = document.getElementById('findMatchCount');
    this.btnFindPrev = document.getElementById('btnFindPrev');
    this.btnFindNext = document.getElementById('btnFindNext');
    this.btnFindClose = document.getElementById('btnFindClose');

    // In-Page Search Engine State
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this.pageTextContents = new Map();
    this._searchDebounceTimer = null;
    this._zoomDebounceTimer = null;
    this._renderSessionId = 0;
    this.dragOverlay = document.getElementById('dragOverlay');
    this.filePermissionBanner = document.getElementById('filePermissionBanner');
    this.btnOpenExtSettings = document.getElementById('btnOpenExtSettings');
    this.btnCloseBanner = document.getElementById('btnCloseBanner');

    // Themes: Clean Light, Dark, and Charcoal #3C3C3C (Authentic PDF colors)
    this.themes = ['theme-light', 'theme-dark', 'theme-charcoal'];
    this.currentThemeIndex = 0;

    // Initialize Smooth Scroll Engine with Edge-like responsive physics
    this.smoothScroll = new SmoothScrollEngine(this.container, {
      damping: 0.18,
      multiplier: 1.15
    });

    // Observer for virtual page rendering
    this.intersectionObserver = null;

    this.init();
  }

  async init() {
    this._bindEvents();
    this._initObservers();
    await this._loadSettings();

    // Check if URL parameter has a file to load
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get('file');

    if (fileParam) {
      this.loadPdf(fileParam);
    }
  }

  async _loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const res = await chrome.storage.local.get(['theme', 'smoothScroll', 'damping']);
        if (res.theme) {
          const idx = this.themes.indexOf(res.theme);
          if (idx !== -1) {
            this.currentThemeIndex = idx;
            document.body.className = this.themes[idx];
          }
        }
        if (res.smoothScroll !== undefined) {
          this.smoothScroll.setEnabled(res.smoothScroll);
        }
        if (res.damping !== undefined) {
          this.smoothScroll.setDamping(res.damping);
        }
      } catch (e) {
        console.warn('Storage read error:', e);
      }

      // Real-time sync with extension popup toggles
      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local') {
            if (changes.smoothScroll !== undefined) {
              this.smoothScroll.setEnabled(changes.smoothScroll.newValue);
              this._showToast(changes.smoothScroll.newValue ? 'Đã bật cuộn mượt SmoothPDF' : 'Đã tắt cuộn mượt (Sử dụng phần mềm cuộn ngoài)', 2000);
            }
            if (changes.damping !== undefined) {
              this.smoothScroll.setDamping(changes.damping.newValue);
            }
            if (changes.theme !== undefined) {
              const idx = this.themes.indexOf(changes.theme.newValue);
              if (idx !== -1) {
                this.currentThemeIndex = idx;
                document.body.className = this.themes[idx];
              }
            }
          }
        });
      }
    }
  }

  _bindEvents() {
    // Toolbar navigation
    document.getElementById('btnPrevPage').addEventListener('click', () => this.goToPrevPage());
    document.getElementById('btnNextPage').addEventListener('click', () => this.goToNextPage());
    this.pageNumberInput.addEventListener('change', (e) => {
      const p = parseInt(e.target.value, 10);
      if (!isNaN(p)) this.goToPage(p);
    });

    // Monotonic scroll listener to track active page number smoothly
    this.container.addEventListener('scroll', () => this._onContainerScroll(), { passive: true });

    // Zoom
    document.getElementById('btnZoomIn').addEventListener('click', () => this.zoomStep(0.2));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.zoomStep(-0.2));
    this.zoomSelect.addEventListener('change', (e) => this.setZoom(e.target.value));

    // Rotate
    document.getElementById('btnRotate').addEventListener('click', () => this.rotate());

    // Theme toggle (Light / Dark)
    document.getElementById('btnThemeToggle').addEventListener('click', () => this.toggleTheme());

    // Print & Download
    document.getElementById('btnPrint').addEventListener('click', () => window.print());
    document.getElementById('btnDownload').addEventListener('click', () => this.downloadFile());

    // Sidebar toggle
    document.getElementById('btnToggleSidebar').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('tabThumbnails').addEventListener('click', () => this.switchSidebarTab('thumbnails'));
    document.getElementById('tabOutline').addEventListener('click', () => this.switchSidebarTab('outline'));

    // Search (Ctrl + F)
    document.getElementById('btnSearch').addEventListener('click', () => this.toggleFindBar());
    if (this.btnFindClose) {
      this.btnFindClose.addEventListener('click', () => this.toggleFindBar(false));
    }
    if (this.btnFindNext) {
      this.btnFindNext.addEventListener('click', () => this.findNext());
    }
    if (this.btnFindPrev) {
      this.btnFindPrev.addEventListener('click', () => this.findPrev());
    }
    if (this.findInput) {
      this.findInput.addEventListener('input', (e) => this._onFindInput(e.target.value));
      this.findInput.addEventListener('keydown', (e) => this._onFindKeyDown(e));
    }

    // Permission Banner actions
    if (this.btnOpenExtSettings) {
      this.btnOpenExtSettings.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'openExtensionSettings' });
        }
      });
    }
    if (this.btnCloseBanner) {
      this.btnCloseBanner.addEventListener('click', () => {
        if (this.filePermissionBanner) this.filePermissionBanner.classList.add('hidden');
      });
    }

    // File Picker
    if (this.filePicker) {
      this.filePicker.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.loadLocalFile(e.target.files[0]);
        }
      });
    }

    if (this.btnBrowseFile) {
      this.btnBrowseFile.addEventListener('click', () => this.filePicker.click());
    }

    // Window Drag & Drop (Strictly filter for OS file drags only)
    const isFileDrag = (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      const types = Array.from(e.dataTransfer.types);
      return types.includes('Files') || types.includes('application/x-moz-file');
    };

    window.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (this.dragOverlay) this.dragOverlay.classList.remove('hidden');
    });

    window.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (this.dragOverlay && this.dragOverlay.classList.contains('hidden')) {
        this.dragOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        if (this.dragOverlay) this.dragOverlay.classList.add('hidden');
      }
    });

    window.addEventListener('drop', (e) => {
      if (this.dragOverlay) this.dragOverlay.classList.add('hidden');
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.loadLocalFile(e.dataTransfer.files[0]);
      }
    });

    if (this.dragOverlay) {
      this.dragOverlay.addEventListener('dragleave', (e) => {
        if (e.target === this.dragOverlay) {
          this.dragOverlay.classList.add('hidden');
        }
      });
      this.dragOverlay.addEventListener('click', () => {
        this.dragOverlay.classList.add('hidden');
      });
    }

    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', (e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        this.dropZone.classList.add('dragover');
      });
      this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
      this.dropZone.addEventListener('drop', (e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.loadLocalFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          this.zoomStep(0.2);
        } else if (e.key === '-') {
          e.preventDefault();
          this.zoomStep(-0.2);
        } else if (e.key === '0') {
          e.preventDefault();
          this.setZoom('1');
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFindBar(true);
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          window.print();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          this.downloadFile();
        }
      } else {
        if (e.key === 'r' || e.key === 'R') {
          if (document.activeElement.tagName !== 'INPUT') {
            this.rotate();
          }
        } else if (e.key === 'd' || e.key === 'D') {
          if (document.activeElement.tagName !== 'INPUT') {
            this.toggleTheme();
          }
        }
      }
    });

    // Ctrl + Mouse Wheel for instant GPU zoom
    this.container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        this.zoomStep(delta, true);
      }
    }, { passive: false });

    // Resize window
    window.addEventListener('resize', () => {
      if (this.scaleMode === 'fit-width' || this.scaleMode === 'fit-page') {
        this._recomputeScale();
        this._updatePagesLayout();
      }
    });

    // Text Layer Selection stabilization (prevents jumping & sticking to bottom)
    this.pagesContainer.addEventListener('mousedown', (e) => {
      const textLayer = e.target.closest('.textLayer, .text-layer');
      if (!textLayer) return;
      const end = textLayer.querySelector('.endOfContent');
      if (end) {
        end.classList.add('active');
      }
    });

    this.pagesContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) {
        const textLayer = e.target.closest('.textLayer, .text-layer');
        if (textLayer) {
          const end = textLayer.querySelector('.endOfContent');
          if (end && !end.classList.contains('active')) {
            end.classList.add('active');
          }
        }
      }
    });

    // Prevent dragging selected text inside PDF pages
    this.pagesContainer.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
      document.querySelectorAll('.endOfContent.active').forEach((end) => {
        end.style.top = '';
        end.classList.remove('active');
      });
    });

    // Clean up copied text (strip null bytes)
    document.addEventListener('copy', (event) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const str = selection.toString();
      if (str && str.includes('\u0000')) {
        event.clipboardData.setData('text/plain', str.replace(/\u0000/g, ''));
        event.preventDefault();
      }
    });
  }

  _initObservers() {
    this._renderQueue = [];
    this._isProcessingQueue = false;

    // IntersectionObserver for lazy rendering ONLY (renders visible + 1 viewport buffer)
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const pageNum = parseInt(entry.target.dataset.pageNumber, 10);
        if (entry.isIntersecting) {
          this.queuePageRender(pageNum);
        } else {
          // If page left viewport and has an active render task that hasn't finished, cancel it
          if (this.renderingTasks.has(pageNum)) {
            const task = this.renderingTasks.get(pageNum);
            task.cancel();
            this.renderingTasks.delete(pageNum);
          }
          // Remove from pending queue if not yet started
          if (this._renderQueue) {
            const idx = this._renderQueue.indexOf(pageNum);
            if (idx !== -1) {
              this._renderQueue.splice(idx, 1);
            }
          }
        }
      });
    }, {
      root: this.container,
      rootMargin: '100% 0px 100% 0px'
    });
  }

  queuePageRender(pageNum) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) return;
    if (this.renderedPages.has(pageNum) || this.renderingTasks.has(pageNum)) return;

    if (!this._renderQueue) this._renderQueue = [];
    if (!this._renderQueue.includes(pageNum)) {
      this._renderQueue.push(pageNum);
    }
    this._processRenderQueue();
  }

  async _processRenderQueue() {
    if (this._isProcessingQueue) return;
    this._isProcessingQueue = true;
    const currentSession = this._renderSessionId;

    try {
      while (this._renderQueue && this._renderQueue.length > 0) {
        if (this._renderSessionId !== currentSession) break;
        // Prioritize page closest to active viewport
        this._renderQueue.sort((a, b) => Math.abs(a - this.currentPage) - Math.abs(b - this.currentPage));
        const nextNum = this._renderQueue.shift();
        if (nextNum && !this.renderedPages.has(nextNum)) {
          await this.renderPage(nextNum);
        }
      }
    } finally {
      if (this._renderSessionId === currentSession) {
        this._isProcessingQueue = false;
      }
    }
  }

  // Smooth, monotonic page number tracker (Eliminates layout thrashing & fast-scrolling jitter)
  _onContainerScroll() {
    if (this._scrollRafId) return;
    this._scrollRafId = requestAnimationFrame(() => {
      this._updateCurrentPageNumber();
      this._scrollRafId = null;
    });
  }

  _updateCurrentPageNumber() {
    if (!this.totalPages || this.totalPages <= 1) return;

    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight;
    const triggerPoint = scrollTop + Math.max(60, clientHeight * 0.35);

    // O(1) mathematical calculation - zero DOM queries, zero layout reflows!
    const pageHeight = this.cachedPageHeight || Math.round(this.basePageHeight * this.currentScale);
    const totalSlot = (pageHeight || 1000) + 16;
    const activePage = Math.max(1, Math.min(this.totalPages, Math.floor(triggerPoint / totalSlot) + 1));

    if (activePage !== this.currentPage) {
      this._setCurrentPageNumber(activePage);
    }
  }

  _setCurrentPageNumber(pageNum) {
    this.currentPage = pageNum;
    if (document.activeElement !== this.pageNumberInput) {
      this.pageNumberInput.value = pageNum;
    }

    // Highlight active thumbnail if sidebar is open
    if (!this.sidebar.classList.contains('hidden')) {
      const thumbs = this.thumbnailsView.children;
      for (let i = 0; i < thumbs.length; i++) {
        thumbs[i].classList.toggle('active', i + 1 === pageNum);
      }
    }
  }

  _showToast(msg, duration = 2500) {
    if (!this.toast) return;
    this.toast.textContent = msg;
    this.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.classList.add('hidden');
    }, duration);
  }

  toggleTheme() {
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
    const newTheme = this.themes[this.currentThemeIndex];
    document.body.className = newTheme;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ theme: newTheme });
    }

    const themeNames = {
      'theme-light': 'Giao diện Sáng',
      'theme-dark': 'Giao diện Tối',
      'theme-charcoal': 'Giao diện Than chì (#3C3C3C)'
    };
    this._showToast(themeNames[newTheme] || newTheme, 1500);
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('hidden');
  }

  switchSidebarTab(tab) {
    document.getElementById('tabThumbnails').classList.toggle('active', tab === 'thumbnails');
    document.getElementById('tabOutline').classList.toggle('active', tab === 'outline');
    this.thumbnailsView.classList.toggle('active', tab === 'thumbnails');
    this.outlineView.classList.toggle('active', tab === 'outline');

    if (tab === 'thumbnails' && this.thumbnailsView.children.length === 0 && this.pdfDoc) {
      this._generateThumbnails();
    }
  }

  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _onFindInput(val) {
    clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      this.performSearch(val);
    }, 150);
  }

  _onFindKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        this.findPrev();
      } else {
        this.findNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.toggleFindBar(false);
    }
  }

  toggleFindBar(show) {
    const isVisible = !this.findBar.classList.contains('hidden');
    const shouldShow = show !== undefined ? show : !isVisible;
    if (shouldShow) {
      this.findBar.classList.remove('hidden');
      this.findInput.focus();
      this.findInput.select();
      if (this.findInput.value.trim()) {
        this.performSearch(this.findInput.value.trim());
      }
    } else {
      this.findBar.classList.add('hidden');
      this.clearSearch();
      this.container.focus();
    }
  }

  async performSearch(query) {
    const q = (query || '').trim();
    if (!q) {
      this.clearSearch();
      return;
    }

    this.searchQuery = q;
    if (this.findMatchCount) {
      this.findMatchCount.textContent = 'Đang tìm...';
      this.findMatchCount.classList.remove('no-match');
    }

    if (!this.pdfDoc || this.totalPages <= 0) return;

    // Load text of all pages in parallel if not cached
    const loadPromises = [];
    for (let i = 1; i <= this.totalPages; i++) {
      if (!this.pageTextContents.has(i)) {
        loadPromises.push(
          this.pdfDoc.getPage(i).then(page => page.getTextContent()).then(tc => {
            this.pageTextContents.set(i, tc);
          }).catch(err => {
            console.warn(`Failed to extract text from page ${i}:`, err);
          })
        );
      }
    }
    if (loadPromises.length > 0) {
      await Promise.all(loadPromises);
    }

    // Check if query changed while loading
    if (this.searchQuery !== q) return;

    const escaped = this._escapeRegExp(q);
    const regex = new RegExp(escaped, 'gi');
    const matches = [];
    let globalIdx = 0;

    for (let p = 1; p <= this.totalPages; p++) {
      const tc = this.pageTextContents.get(p);
      if (!tc || !tc.items) continue;

      let pageMatchIdx = 0;
      if (q.includes(' ')) {
        // Multi-word phrase matching across joined items
        let pageText = '';
        const itemMap = [];
        for (let j = 0; j < tc.items.length; j++) {
          const str = tc.items[j].str || '';
          const start = pageText.length;
          const end = start + str.length;
          itemMap.push({ itemIndex: j, start, end });
          pageText += str + ' ';
        }

        const ptLower = pageText.toLowerCase();
        const qLower = q.toLowerCase();
        let pos = 0;
        while ((pos = ptLower.indexOf(qLower, pos)) !== -1) {
          const matchEnd = pos + qLower.length;
          const overlapped = itemMap.filter(im => !(im.end <= pos || im.start >= matchEnd));
          matches.push({
            globalIndex: globalIdx++,
            pageNum: p,
            matchIndexInPage: pageMatchIdx++,
            itemIndex: overlapped[0]?.itemIndex || 0,
            text: pageText.slice(pos, matchEnd)
          });
          pos += qLower.length;
        }
      } else {
        // Single word or keyword matching
        for (let j = 0; j < tc.items.length; j++) {
          const str = tc.items[j].str;
          if (!str) continue;

          regex.lastIndex = 0;
          let m;
          while ((m = regex.exec(str)) !== null) {
            matches.push({
              globalIndex: globalIdx++,
              pageNum: p,
              matchIndexInPage: pageMatchIdx++,
              itemIndex: j,
              text: m[0]
            });
          }
        }
      }
    }

    this.searchResults = matches;

    if (matches.length === 0) {
      this.currentSearchIndex = -1;
      this._clearAllHighlights();
      this._updateMatchCountText();
      return;
    }

    // Pick first match on or after current page
    const nextIdx = matches.findIndex(m => m.pageNum >= this.currentPage);
    this.currentSearchIndex = nextIdx !== -1 ? nextIdx : 0;
    this._updateMatchCountText();

    // Highlight matches across all currently rendered pages
    this.renderedPages.forEach(p => this._highlightPage(p));

    // Jump to active match
    this._goToMatch(this.currentSearchIndex);
  }

  _updateMatchCountText() {
    if (!this.findMatchCount) return;
    if (this.searchResults.length === 0) {
      this.findMatchCount.textContent = '0 kết quả';
      this.findMatchCount.classList.add('no-match');
    } else {
      this.findMatchCount.textContent = `${this.currentSearchIndex + 1}/${this.searchResults.length}`;
      this.findMatchCount.classList.remove('no-match');
    }
  }

  findNext() {
    if (this.searchResults.length === 0) return;
    const nextIdx = (this.currentSearchIndex + 1) % this.searchResults.length;
    this._goToMatch(nextIdx);
  }

  findPrev() {
    if (this.searchResults.length === 0) return;
    const prevIdx = (this.currentSearchIndex - 1 + this.searchResults.length) % this.searchResults.length;
    this._goToMatch(prevIdx);
  }

  async _goToMatch(index) {
    if (index < 0 || index >= this.searchResults.length) return;
    this.currentSearchIndex = index;
    const match = this.searchResults[index];
    this._updateMatchCountText();

    // 1. Scroll to target page
    this.goToPage(match.pageNum);

    // 2. Ensure target page is rendered
    if (!this.renderedPages.has(match.pageNum)) {
      await this.renderPage(match.pageNum);
    }

    // 3. Clear active class on previous highlights everywhere
    const oldActives = this.pagesContainer.querySelectorAll('mark.find-highlight.active');
    oldActives.forEach(el => el.classList.remove('active'));

    // 4. Highlight target page
    this._highlightPage(match.pageNum);

    // 5. Center active match smoothly into view
    setTimeout(() => {
      const pageDiv = document.getElementById(`page-container-${match.pageNum}`);
      if (pageDiv) {
        const activeMark = pageDiv.querySelector('mark.find-highlight.active');
        if (activeMark) {
          activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }, 100);
  }

  _highlightPage(pageNum) {
    if (!this.searchQuery) return;
    const pageDiv = document.getElementById(`page-container-${pageNum}`);
    if (!pageDiv) return;

    const textLayer = pageDiv.querySelector('.textLayer, .text-layer');
    if (!textLayer) return;

    this._clearPageHighlights(textLayer);

    const pageMatches = this.searchResults.filter(m => m.pageNum === pageNum);
    if (pageMatches.length === 0) return;

    const escaped = this._escapeRegExp(this.searchQuery);
    const regex = new RegExp(`(${escaped})`, 'gi');

    const spans = textLayer.querySelectorAll('span:not(.endOfContent)');
    let pageCounter = 0;

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const text = span.textContent;
      if (!text) continue;

      regex.lastIndex = 0;
      if (!regex.test(text)) continue;

      regex.lastIndex = 0;
      span.innerHTML = text.replace(regex, (matchStr) => {
        const isCurrent = (
          this.currentSearchIndex >= 0 &&
          this.searchResults[this.currentSearchIndex] &&
          this.searchResults[this.currentSearchIndex].pageNum === pageNum &&
          this.searchResults[this.currentSearchIndex].matchIndexInPage === pageCounter
        );
        pageCounter++;
        const cls = isCurrent ? 'find-highlight active' : 'find-highlight';
        return `<mark class="${cls}">${matchStr}</mark>`;
      });
    }

    // If active match is on this page, scroll into view
    if (this.currentSearchIndex >= 0 && this.searchResults[this.currentSearchIndex]?.pageNum === pageNum) {
      const activeMark = textLayer.querySelector('mark.find-highlight.active');
      if (activeMark) {
        activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  _clearPageHighlights(textLayer) {
    if (!textLayer) return;
    const marks = textLayer.querySelectorAll('mark.find-highlight');
    if (marks.length === 0) return;

    const spans = textLayer.querySelectorAll('span:not(.endOfContent)');
    spans.forEach(span => {
      if (span.querySelector('mark.find-highlight')) {
        span.textContent = span.textContent;
      }
    });
  }

  _clearAllHighlights() {
    const allTextLayers = this.pagesContainer.querySelectorAll('.textLayer, .text-layer');
    allTextLayers.forEach(tl => this._clearPageHighlights(tl));
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this._clearAllHighlights();
    if (this.findMatchCount) {
      this.findMatchCount.textContent = '0 kết quả';
      this.findMatchCount.classList.remove('no-match');
    }
  }

  // Load from local File object (drag-drop or file picker)
  async loadLocalFile(file) {
    if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
      this._showToast('Vui lòng chọn một file PDF hợp lệ!');
      return;
    }

    this.docTitle.textContent = file.name;
    document.title = file.name;
    this._showToast(`Đang mở: ${file.name}...`);

    // Hide welcome immediately
    this.welcomeScreen.classList.add('hidden');
    this.welcomeScreen.style.display = 'none';

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      const typedarray = new Uint8Array(e.target.result);
      this.loadPdfData(typedarray, file.name);
    };
    fileReader.readAsArrayBuffer(file);
  }

  _extractFilenameFromUrl(url) {
    try {
      const match = url.match(/filename(?:%2a%3d|\*=|\%3d|=)(?:UTF-8'')?["']?([^;&"'%]+|[^;&"']+)/i);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1].replace(/["']/g, '').trim());
        if (decoded) return decoded;
      }
      let name = url.substring(url.lastIndexOf('/') + 1).split('?')[0].split('#')[0];
      return decodeURIComponent(name) || 'document.pdf';
    } catch (e) {
      return 'document.pdf';
    }
  }

  // Load from URL (web or file:///)
  async loadPdf(url) {
    this.pdfUrl = url;
    let filename = this._extractFilenameFromUrl(url);

    // 1. Immediately check if URL has attachment/download parameters (e.g. S3 presigned, Canvas LMS)
    const lowerUrl = url.toLowerCase();
    const isAttachmentUrl = lowerUrl.includes('response-content-disposition') ||
                            lowerUrl.includes('disposition=attachment') ||
                            lowerUrl.includes('download_frd=1') ||
                            lowerUrl.includes('export=download') ||
                            lowerUrl.includes('action=download') ||
                            lowerUrl.includes('download=1') ||
                            lowerUrl.includes('dl=1');

    if (isAttachmentUrl) {
      console.log('[SmoothPDF] URL parameter indicates attachment download, triggering direct download.');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'downloadPdfDirectly',
          url: url,
          filename: filename,
          closeTab: true
        });
        setTimeout(() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.close();
          }
        }, 100);
        return;
      }
    }

    this.docTitle.textContent = filename;
    document.title = filename;

    // Hide welcome immediately
    this.welcomeScreen.classList.add('hidden');
    this.welcomeScreen.style.display = 'none';

    // Check file scheme permission if opening a local file:/// URL
    if (url.startsWith('file://')) {
      if (typeof chrome !== 'undefined' && chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
          if (!isAllowed && this.filePermissionBanner) {
            this.filePermissionBanner.classList.remove('hidden');
          }
        });
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // Check if server marked this file as an attachment download
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'checkContentDisposition', url: url }, (res) => {
          if (res && res.isAttachment) {
            console.log('[SmoothPDF] Server sent Content-Disposition: attachment, triggering direct download.');
            chrome.runtime.sendMessage({
              action: 'downloadPdfDirectly',
              url: url,
              filename: res.filename || filename
            });
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.close();
            }
          }
        });
      }
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        url: url,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      });
      const pdf = await loadingTask.promise;
      this._onDocumentLoaded(pdf);
    } catch (err) {
      console.warn('Direct PDF load failed, trying background proxy:', err);
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetchPdf', url: url }, (res) => {
          if (res && res.success && res.dataUrl) {
            this.loadPdfData(res.dataUrl, filename);
          } else {
            if (url.startsWith('file://') && this.filePermissionBanner) {
              this.filePermissionBanner.classList.remove('hidden');
            }
            this._showToast(`Không thể đọc file: ${err.message || 'Chưa cấp quyền'}. Kéo thả file vào đây để mở ngay!`, 5000);
            this.welcomeScreen.classList.remove('hidden');
            this.welcomeScreen.style.display = 'flex';
          }
        });
      } else {
        this._showToast(`Không thể tải PDF: ${err.message}`);
        this.welcomeScreen.classList.remove('hidden');
        this.welcomeScreen.style.display = 'flex';
      }
    }
  }

  async loadPdfData(data, filename) {
    this.pdfData = data;
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: data,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      });
      const pdf = await loadingTask.promise;
      this._onDocumentLoaded(pdf);
    } catch (err) {
      console.error('Failed to load PDF data:', err);
      this._showToast(`Lỗi đọc dữ liệu PDF: ${err.message}`);
      this.welcomeScreen.classList.remove('hidden');
      this.welcomeScreen.style.display = 'flex';
    }
  }

  async _onDocumentLoaded(pdfDoc) {
    this.pdfDoc = pdfDoc;
    this.totalPages = pdfDoc.numPages;
    this.numPagesSpan.textContent = this.totalPages;
    this.pageNumberInput.max = this.totalPages;
    this.currentPage = 1;
    this.renderedPages.clear();
    this.renderingTasks.clear();
    this.pageTextContents.clear();
    this.clearSearch();

    // Hide welcome completely, show pages container
    this.welcomeScreen.classList.add('hidden');
    this.welcomeScreen.style.display = 'none';
    this.pagesContainer.classList.remove('hidden');
    this.pagesContainer.style.display = 'flex';

    // Ensure scroll starts right at top of page 1
    this.container.scrollTop = 0;
    this.smoothScroll.scrollTo(0, { immediate: true });

    // Read first page to establish initial scale & aspect ratio
    const firstPage = await pdfDoc.getPage(1);
    const unscaledViewport = firstPage.getViewport({ scale: 1.0, rotation: this.rotation });
    this.basePageWidth = unscaledViewport.width;
    this.basePageHeight = unscaledViewport.height;

    // Compute scale
    this._recomputeScale();

    // Build virtual page skeletons
    await this._buildPagePlaceholders();

    // Load outline (TOC)
    this._loadOutline();

    this._showToast(`Đã mở ${this.totalPages} trang`);
  }

  _recomputeScale() {
    if (this.scaleMode === 'fit-width') {
      const availableWidth = this.container.clientWidth - 40;
      this.currentScale = Math.max(0.3, Math.min(3.0, availableWidth / this.basePageWidth));
    } else if (this.scaleMode === 'fit-page') {
      const availableHeight = this.container.clientHeight - 40;
      this.currentScale = Math.max(0.3, Math.min(3.0, availableHeight / this.basePageHeight));
    } else {
      this.currentScale = parseFloat(this.scaleMode) || 1.0;
    }
    this.container.style.setProperty('--scale-factor', String(this.currentScale));
    this.pagesContainer.style.setProperty('--scale-factor', String(this.currentScale));
  }

  async _buildPagePlaceholders() {
    this.pagesContainer.innerHTML = '';
    const frag = document.createDocumentFragment();

    const pageWidth = Math.round(this.basePageWidth * this.currentScale);
    const pageHeight = Math.round(this.basePageHeight * this.currentScale);

    for (let i = 1; i <= this.totalPages; i++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page-container';
      pageDiv.id = `page-container-${i}`;
      pageDiv.dataset.pageNumber = i;
      pageDiv.style.width = `${pageWidth}px`;
      pageDiv.style.height = `${pageHeight}px`;

      const skeleton = document.createElement('div');
      skeleton.className = 'page-loading-skeleton';
      skeleton.textContent = `Trang ${i}`;
      pageDiv.appendChild(skeleton);

      const canvas = document.createElement('canvas');
      canvas.className = 'page-canvas';
      pageDiv.appendChild(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer text-layer';
      textLayer.style.setProperty('--scale-factor', String(this.currentScale));
      pageDiv.appendChild(textLayer);

      frag.appendChild(pageDiv);
    }

    this.pagesContainer.appendChild(frag);

    // Attach intersection observer for rendering only
    for (let i = 1; i <= this.totalPages; i++) {
      const el = document.getElementById(`page-container-${i}`);
      if (el) {
        this.intersectionObserver.observe(el);
      }
    }
  }

  _applyQuickZoomCss() {
    let baseW = this.basePageWidth;
    let baseH = this.basePageHeight;
    if (this.rotation === 90 || this.rotation === 270) {
      baseW = this.basePageHeight;
      baseH = this.basePageWidth;
    }
    const pageWidth = Math.round(baseW * this.currentScale);
    const pageHeight = Math.round(baseH * this.currentScale);

    const pageContainers = this.pagesContainer.querySelectorAll('.page-container');
    pageContainers.forEach((el) => {
      el.style.width = `${pageWidth}px`;
      el.style.height = `${pageHeight}px`;

      const canvas = el.querySelector('canvas');
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }

      const tl = el.querySelector('.textLayer, .text-layer');
      if (tl) {
        tl.style.width = `${pageWidth}px`;
        tl.style.height = `${pageHeight}px`;
        tl.style.setProperty('--scale-factor', String(this.currentScale));
      }
    });
  }

  _updatePagesLayout() {
    clearTimeout(this._zoomDebounceTimer);

    // 1. Advance session ID and cancel all ongoing render tasks to prevent obsolete renders
    this._renderSessionId++;
    this.renderingTasks.forEach((task) => {
      try {
        task.cancel();
      } catch (e) {}
    });
    this.renderingTasks.clear();

    // 2. Clear render queue and rendered page set
    this._renderQueue = [];
    this._isProcessingQueue = false;
    this.renderedPages.clear();

    // 3. Anchor scroll position around the currently viewed page
    const curPageDiv = document.getElementById(`page-container-${this.currentPage}`);
    let relativeRatio = 0;
    if (curPageDiv && curPageDiv.offsetHeight > 0) {
      const pageTop = curPageDiv.offsetTop;
      const currentScroll = this.container.scrollTop;
      relativeRatio = Math.max(0, Math.min(1, (currentScroll - pageTop) / curPageDiv.offsetHeight));
    }

    // 4. Update page dimensions and reset textLayers for fresh rendering
    let baseW = this.basePageWidth;
    let baseH = this.basePageHeight;
    if (this.rotation === 90 || this.rotation === 270) {
      baseW = this.basePageHeight;
      baseH = this.basePageWidth;
    }
    const pageWidth = Math.round(baseW * this.currentScale);
    const pageHeight = Math.round(baseH * this.currentScale);

    const pageContainers = this.pagesContainer.querySelectorAll('.page-container');
    pageContainers.forEach((el) => {
      el.style.width = `${pageWidth}px`;
      el.style.height = `${pageHeight}px`;

      const canvas = el.querySelector('canvas');
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }

      const tl = el.querySelector('.textLayer, .text-layer');
      if (tl) {
        tl.innerHTML = '';
        tl.style.width = `${pageWidth}px`;
        tl.style.height = `${pageHeight}px`;
        tl.style.setProperty('--scale-factor', String(this.currentScale));
      }
    });

    // 5. Restore anchored scroll position so reading location does not jump
    if (curPageDiv && curPageDiv.offsetHeight > 0) {
      const newPageTop = curPageDiv.offsetTop;
      const targetScroll = Math.round(newPageTop + (relativeRatio * curPageDiv.offsetHeight));
      this.container.scrollTop = targetScroll;
      if (this.smoothScroll) {
        this.smoothScroll.scrollTo(targetScroll, { immediate: true });
      }
    }

    // 6. Find all visible and buffer pages (1 full viewport above and below)
    const containerRect = this.container.getBoundingClientRect();
    const buffer = Math.max(window.innerHeight, this.container.clientHeight);
    const visibleEntries = Array.from(pageContainers).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom >= (containerRect.top - buffer) && rect.top <= (containerRect.bottom + buffer);
    });

    // Prioritize active page, then closest pages
    visibleEntries.sort((a, b) => {
      const aNum = parseInt(a.dataset.pageNumber, 10);
      const bNum = parseInt(b.dataset.pageNumber, 10);
      return Math.abs(aNum - this.currentPage) - Math.abs(bNum - this.currentPage);
    });

    // Queue all visible pages through the single orderly queue
    visibleEntries.forEach((el) => {
      this.queuePageRender(parseInt(el.dataset.pageNumber, 10));
    });
  }

  async renderPage(pageNum) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) return;
    if (this.renderedPages.has(pageNum)) return; // Never re-render pages already drawn!
    if (this.renderingTasks.has(pageNum)) return;

    const pageDiv = document.getElementById(`page-container-${pageNum}`);
    if (!pageDiv) return;

    const canvas = pageDiv.querySelector('canvas');
    const skeleton = pageDiv.querySelector('.page-loading-skeleton');
    const textLayer = pageDiv.querySelector('.textLayer, .text-layer');

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.currentScale, rotation: this.rotation });

      // Support High-DPI / Retina displays (Crisp rendering)
      const outputScale = Math.min(window.devicePixelRatio || 1, 2.0);

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.save();
      ctx.scale(outputScale, outputScale);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      this.renderingTasks.set(pageNum, renderTask);

      await renderTask.promise;
      ctx.restore();

      this.renderingTasks.delete(pageNum);
      this.renderedPages.add(pageNum);

      if (skeleton) {
        skeleton.style.display = 'none';
      }

      // Schedule text layer rendering when idle to keep scrolling at 60-120 FPS
      this._scheduleTextLayer(page, viewport, textLayer);

    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.warn(`Render error on page ${pageNum}:`, err);
      }
      this.renderingTasks.delete(pageNum);
    }
  }

  _scheduleTextLayer(page, viewport, textLayerDiv) {
    const run = () => {
      this._renderTextLayer(page, viewport, textLayerDiv);
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 300 });
    } else {
      setTimeout(run, 60);
    }
  }

  async _renderTextLayer(page, viewport, textLayerDiv) {
    try {
      if (!textLayerDiv) return;
      if (textLayerDiv.dataset.renderedScale === String(viewport.scale) && textLayerDiv.children.length > 1) {
        return; // Already rendered at this exact scale
      }
      textLayerDiv.innerHTML = '';
      textLayerDiv.dataset.renderedScale = String(viewport.scale);
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

      const textContent = await page.getTextContent();
      if (pdfjsLib.renderTextLayer) {
        const textTask = pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
          textDivs: []
        });
        if (textTask && textTask.promise) {
          await textTask.promise;
        }
      }

      // Append endOfContent helper to anchor selection range and eliminate bottom sticking
      const endOfContent = document.createElement('div');
      endOfContent.className = 'endOfContent';
      textLayerDiv.appendChild(endOfContent);

      // Cache text content for fast search
      if (!this.pageTextContents.has(page.pageNumber)) {
        this.pageTextContents.set(page.pageNumber, textContent);
      }

      // If a search query is currently active, highlight matches on this page
      if (this.searchQuery) {
        this._highlightPage(page.pageNumber);
      }
    } catch (e) {
      console.warn('Text layer render failed:', e);
    }
  }

  goToPage(pageNum) {
    const p = Math.max(1, Math.min(pageNum, this.totalPages));
    const targetEl = document.getElementById(`page-container-${p}`);
    if (targetEl) {
      const targetY = targetEl.offsetTop - 10;
      this.smoothScroll.scrollTo(targetY);
      this._setCurrentPageNumber(p);
    }
  }

  goToNextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  goToPrevPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  setZoom(val) {
    this.scaleMode = val;
    this.zoomSelect.value = val;
    this._recomputeScale();
    this._updatePagesLayout();
  }

  zoomStep(delta, isWheel = false) {
    let nextScale = this.currentScale + delta;
    nextScale = Math.max(0.3, Math.min(3.5, Math.round(nextScale * 10) / 10));
    this.scaleMode = String(nextScale);
    this.zoomSelect.value = String(nextScale);
    if (!this.zoomSelect.value) {
      const opt = document.createElement('option');
      opt.value = String(nextScale);
      opt.textContent = `${Math.round(nextScale * 100)}%`;
      this.zoomSelect.appendChild(opt);
      this.zoomSelect.value = String(nextScale);
    }
    this.currentScale = nextScale;
    this._showToast(`Thu phóng: ${Math.round(this.currentScale * 100)}%`, 1000);

    if (isWheel) {
      this._applyQuickZoomCss();
      clearTimeout(this._zoomDebounceTimer);
      this._zoomDebounceTimer = setTimeout(() => {
        this._updatePagesLayout();
      }, 120);
    } else {
      this._updatePagesLayout();
    }
  }

  rotate() {
    this.rotation = (this.rotation + 90) % 360;
    this.renderedPages.clear();
    this._updatePagesLayout();
    this._showToast(`Xoay: ${this.rotation}°`, 1000);
  }

  async _loadOutline() {
    try {
      const outline = await this.pdfDoc.getOutline();
      if (!outline || outline.length === 0) {
        this.outlineView.innerHTML = '<div class="empty-outline">Tài liệu không có mục lục</div>';
        return;
      }

      this.outlineView.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'outline-list';

      outline.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'outline-item';
        row.textContent = item.title;
        row.addEventListener('click', async () => {
          if (item.dest) {
            let dest = item.dest;
            if (typeof dest === 'string') {
              dest = await this.pdfDoc.getDestination(dest);
            }
            if (dest && dest[0]) {
              const pageIndex = await this.pdfDoc.getPageIndex(dest[0]);
              this.goToPage(pageIndex + 1);
            }
          }
        });
        list.appendChild(row);
      });

      this.outlineView.appendChild(list);
    } catch (e) {
      this.outlineView.innerHTML = '<div class="empty-outline">Không thể nạp mục lục</div>';
    }
  }

  async _generateThumbnails() {
    if (!this.pdfDoc) return;
    this.thumbnailsView.innerHTML = '';

    for (let i = 1; i <= Math.min(this.totalPages, 100); i++) {
      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      item.dataset.pageNumber = i;
      if (i === this.currentPage) item.classList.add('active');

      const wrapper = document.createElement('div');
      wrapper.className = 'thumbnail-canvas-wrapper';

      const canvas = document.createElement('canvas');
      wrapper.appendChild(canvas);
      item.appendChild(wrapper);

      const numLabel = document.createElement('div');
      numLabel.className = 'thumbnail-page-number';
      numLabel.textContent = i;
      item.appendChild(numLabel);

      item.addEventListener('click', () => this.goToPage(i));
      this.thumbnailsView.appendChild(item);

      this._renderThumbnailPage(i, canvas);
    }
  }

  async _renderThumbnailPage(pageNum, canvas) {
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.18, rotation: this.rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (e) {}
  }

  downloadFile() {
    if (this.pdfUrl) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'downloadPdfDirectly',
          url: this.pdfUrl,
          filename: this.docTitle.textContent || 'document.pdf'
        });
        return;
      }
      const a = document.createElement('a');
      a.href = this.pdfUrl;
      a.download = this.docTitle.textContent || 'document.pdf';
      a.click();
    } else if (this.pdfData) {
      const blob = new Blob([this.pdfData], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = this.docTitle.textContent || 'document.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } else {
      this._showToast('Chưa có file nào để tải về!');
    }
  }
}

// Auto start on page load
window.addEventListener('DOMContentLoaded', () => {
  window.pdfViewerApp = new SmoothPdfViewer();
});
