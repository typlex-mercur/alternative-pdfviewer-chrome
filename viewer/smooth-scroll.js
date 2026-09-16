/**
 * SmoothScrollEngine
 * High-performance momentum smooth scrolling engine with sub-pixel interpolation (60-120fps)
 * Designed to mimic the buttery-smooth scrolling physics of Microsoft Edge.
 */
class SmoothScrollEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.damping = options.damping || 0.18; // Edge-like buttery smooth response (0.16-0.20)
    this.multiplier = options.multiplier || 1.15; // Wheel distance multiplier
    
    this.currentY = container.scrollTop;
    this.targetY = container.scrollTop;
    this.isAnimating = false;
    this.rafId = null;

    // Detect touchpad vs traditional mouse wheel
    this.isTouchpad = false;
    this.wheelEventsHistory = [];

    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._step = this._step.bind(this);

    this.init();
  }

  init() {
    this.container.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    this.container.addEventListener('scroll', this._onScroll, { passive: true });
  }

  destroy() {
    this.container.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKeyDown);
    this.container.removeEventListener('scroll', this._onScroll);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    if (!this.enabled) {
      this.currentY = this.container.scrollTop;
      this.targetY = this.container.scrollTop;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.isAnimating = false;
    }
  }

  setDamping(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 1) {
      this.damping = num;
    }
  }

  _detectTouchpad(e) {
    const now = performance.now();
    this.wheelEventsHistory.push({ time: now, deltaY: Math.abs(e.deltaY) });
    if (this.wheelEventsHistory.length > 5) {
      this.wheelEventsHistory.shift();
    }

    // Touchpads fire many events with non-integer or small deltas (< 40)
    const hasSmallDelta = Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < 40;
    const hasFractionalDelta = Math.abs(e.deltaY) % 1 !== 0;
    return hasSmallDelta || hasFractionalDelta;
  }

  _onWheel(e) {
    if (!this.enabled) return;

    // If Ctrl is pressed, user is zooming - let the viewer handle zoom!
    if (e.ctrlKey || e.metaKey) return;

    // If user is scrolling horizontally more than vertically
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const isTouchpad = this._detectTouchpad(e);
    this.isTouchpad = isTouchpad;

    // Normalize delta
    let delta = e.deltaY;
    if (e.deltaMode === 1) {
      delta *= 40; // Lines
    } else if (e.deltaMode === 2) {
      delta *= window.innerHeight; // Pages
    }

    e.preventDefault();

    const maxScroll = Math.max(0, this.container.scrollHeight - this.container.clientHeight);

    if (isTouchpad) {
      // Touchpad has natural inertia; direct responsive tracking
      this.targetY += delta;
    } else {
      // Traditional mouse wheel: apply momentum multiplier
      this.targetY += delta * this.multiplier;
    }

    // Clamp within bounds with slight elastic limit
    this.targetY = Math.max(0, Math.min(this.targetY, maxScroll));

    if (!this.isAnimating) {
      this.currentY = this.container.scrollTop;
      this.isAnimating = true;
      this.rafId = requestAnimationFrame(this._step);
    }
  }

  _onKeyDown(e) {
    if (!this.enabled) return;

    // Ignore if typing in an input
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    let delta = 0;
    const clientHeight = this.container.clientHeight;

    switch (e.key) {
      case 'ArrowDown':
        delta = 120;
        break;
      case 'ArrowUp':
        delta = -120;
        break;
      case 'PageDown':
        delta = clientHeight * 0.85;
        break;
      case 'PageUp':
        delta = -clientHeight * 0.85;
        break;
      case 'Space':
        delta = e.shiftKey ? -clientHeight * 0.85 : clientHeight * 0.85;
        break;
      case 'Home':
        this.scrollTo(0);
        e.preventDefault();
        return;
      case 'End':
        this.scrollTo(this.container.scrollHeight);
        e.preventDefault();
        return;
      default:
        return;
    }

    if (delta !== 0) {
      e.preventDefault();
      const maxScroll = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
      this.targetY = Math.max(0, Math.min(this.targetY + delta, maxScroll));
      if (!this.isAnimating) {
        this.currentY = this.container.scrollTop;
        this.isAnimating = true;
        this.rafId = requestAnimationFrame(this._step);
      }
    }
  }

  _onScroll() {
    // If external scroll occurs (e.g. user dragged scrollbar directly), sync current/target
    if (!this.isAnimating) {
      this.currentY = this.container.scrollTop;
      this.targetY = this.container.scrollTop;
    }
  }

  _step() {
    if (!this.isAnimating) return;

    const diff = this.targetY - this.currentY;

    if (Math.abs(diff) < 0.5) {
      // Finished interpolating
      this.currentY = this.targetY;
      this.container.scrollTop = this.currentY;
      this.isAnimating = false;
      this.rafId = null;
      return;
    }

    // Snappier for touchpads, smooth gliding momentum for mouse wheel
    const stepDamping = this.isTouchpad ? 0.35 : this.damping;
    this.currentY += diff * stepDamping;
    this.container.scrollTop = this.currentY;

    this.rafId = requestAnimationFrame(this._step);
  }

  /**
   * Smoothly animated programmatic scroll to a specific position
   */
  scrollTo(target, options = {}) {
    const maxScroll = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
    this.targetY = Math.max(0, Math.min(target, maxScroll));

    if (options.immediate) {
      this.currentY = this.targetY;
      this.container.scrollTop = this.targetY;
      this.isAnimating = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      return;
    }

    if (!this.isAnimating) {
      this.currentY = this.container.scrollTop;
      this.isAnimating = true;
      this.rafId = requestAnimationFrame(this._step);
    }
  }
}

if (typeof window !== 'undefined') {
  window.SmoothScrollEngine = SmoothScrollEngine;
}
