// content/shorts.js
// NextFlow content script for YouTube Shorts
// - Detect visible <video> (the short that's playing) and watch time/progress
// - When short ends (or reaches threshold), wait delayMs and then go to next short
// - Policy-aware ad handling: default = pause auto actions during ads; opt-in skip if visible
// - Multiple strategies to go to "next" (click next button, click skip, scroll feed)
// - Receives settings via messages { action: 'settingsUpdated', payload: { ... } }
// - Defensive: idempotent init, debounced actions, MutationObserver for dynamic pages

/* ============================
   Config / Internal state
   ============================ */
const LOG_PREFIX = '[NextFlow:shorts]';
let SETTINGS = {
  autoScroll: true,
  skipAds: false,
  delayMs: 500,
  onlyOnWifi: false,
  pauseOnUnskippableAds: true
};

let initialized = false;
let currentVideo = null;
let timeupdateHandler = null;
let endedHandler = null;
let mutationObserver = null;
let lastActionTimestamp = 0;
const ACTION_DEBOUNCE_MS = 800; // prevent double actions

/* ============================
   Utility helpers
   ============================ */

function log(...args) {
  // comment out or toggle to reduce noise
  console.debug(LOG_PREFIX, ...args);
}

function now() {
  return Date.now();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// check if we should run based on network (onlyOnWifi)
function networkAllows() {
  try {
    if (!SETTINGS.onlyOnWifi) return true;
    const nav = navigator;
    if (nav && nav.connection && nav.connection.effectiveType) {
      // effectiveType values: 'slow-2g', '2g', '3g', '4g'
      const t = nav.connection.effectiveType || '';
      return t === '4g' || t === '5g' || t === 'wifi' || t === 'ethernet';
    }
  } catch (e) {}
  // if we can't determine, be conservative and allow
  return true;
}

/* ============================
   DOM helpers (Selectors & heuristics)
   ============================ */

// Return the most likely visible video element for the current viewport
function findVisibleVideo() {
  const videos = Array.from(document.getElementsByTagName('video'));
  if (!videos.length) return null;

  // Filter playable and visible videos
  const candidates = videos.filter(v => {
    try {
      if (v.duration === 0 || v.videoWidth === 0) return false;
      // visible check: offsetParent or bounding rect in viewport
      const rect = v.getBoundingClientRect();
      const visible = rect.width > 20 && rect.height > 20 && rect.bottom >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight);
      return visible;
    } catch (e) {
      return false;
    }
  });

  if (!candidates.length) return null;

  // Prefer the one with largest area (most likely main short)
  candidates.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  });

  return candidates[0];
}

// Detect whether an ad is currently playing
function isAdPlaying() {
  try {
    // Heuristics:
    // - YouTube often adds ad-related classes/overlays like "ad-showing", "ytp-ad-player-overlay"
    // - Look for obvious skip buttons
    // - Check for 'ad' in any aria-labels
    const adSelectors = [
      '.ad-showing',
      '.ytp-ad-player-overlay',
      '.video-ads', // container for ads
      'ytd-ad-slot', // ad slot element
      '.ytp-ad-text',
      '.ytp-ad-module'
    ];
    for (const sel of adSelectors) {
      if (document.querySelector(sel)) return true;
    }
    // Check for skip button (skippable ad present)
    if (findSkipButton()) return true;

    // Some ads are handled as separate videos (hard to detect). Check for "Ad" badges near metadata
    const badge = document.querySelector('ytd-badge-supported-renderer[slot="badge"]') || document.querySelector('yt-formatted-string.ytd-badge-supported-renderer');
    if (badge && /ad/i.test(badge.textContent || '')) return true;
  } catch (e) {
    // ignore errors in heuristics
  }
  return false;
}

// Try to find a visible "Skip Ad" or similar button element
function findSkipButton() {
  // Common selectors for the skip button
  const candidates = [
    '.ytp-ad-skip-button.ytp-button', // classic
    '.ytp-ad-skip-button', 
    'button[aria-label*="Skip ad"]',
    'button[aria-label*="Skip"]',
    'button:contains("Skip ad")' // :contains not supported - kept for reference
  ];
  for (const sel of candidates) {
    try {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return el;
    } catch (e) {}
  }

  // Fallback: find any button with text "Skip" (iterate buttons)
  const btns = Array.from(document.getElementsByTagName('button'));
  for (const b of btns) {
    try {
      const txt = (b.innerText || b.textContent || '').trim();
      if (!txt) continue;
      if (/^skip/i.test(txt) || /skip ad/i.test(txt)) {
        if (isElementVisible(b)) return b;
      }
    } catch (e) {}
  }
  return null;
}

// Is element visible on viewport and display not none?
function isElementVisible(el) {
  try {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4 && rect.bottom >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight);
  } catch (e) {
    return false;
  }
}

/* ============================
   Action strategies: goToNextShort
   ============================ */

// Strategy A: click player "next" button if present (rare)
function tryClickPlayerNext() {
  try {
    const selectors = [
      'button.ytp-next-button', // video player next
      'button[aria-label*="Next"]'
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && isElementVisible(btn)) {
        btn.click();
        log('Clicked player next button');
        return true;
      }
    }
  } catch (e) {}
  return false;
}

// Strategy B: if skip button present & allowed by settings, click it
function tryClickSkipButtonIfAllowed() {
  if (!SETTINGS.skipAds) return false;
  const skip = findSkipButton();
  if (skip) {
    try {
      skip.click();
      log('Clicked skip-ad button (user opted-in)');
      return true;
    } catch (e) {
      log('Failed clicking skip button', e);
    }
  }
  return false;
}

// Strategy C: in Shorts feed, scroll down by viewport height (smooth)
function tryScrollToNext() {
  try {
    // For feed-style pages, scroll to the next element by window.innerHeight
    window.scrollBy({ top: Math.max(window.innerHeight * 0.9, 500), left: 0, behavior: 'smooth' });
    log('Performed smooth scroll to next (feed fallback)');
    return true;
  } catch (e) {
    return false;
  }
}

// Strategy D: attempt to find next short link in DOM and click it (single-short page)
function tryClickNextShortLink() {
  try {
    // Common pattern: next short card anchors with href '/shorts/<id>'
    const anchors = Array.from(document.querySelectorAll('a[href*="/shorts/"]'));
    if (!anchors.length) return false;

    // Find an anchor that is not the current short (href differs from location)
    const currentHref = location.pathname + location.search + location.hash;
    const candidate = anchors.find(a => {
      try {
        const href = a.getAttribute('href') || '';
        if (!href) return false;
        // ignore same as current
        return !href.includes(location.pathname) && isElementVisible(a);
      } catch (e) {
        return false;
      }
    });

    if (candidate) {
      candidate.click();
      log('Clicked next short anchor');
      return true;
    }
  } catch (e) {}
  return false;
}

// The central "go to next" which tries strategies in order
function goToNextShort() {
  // Debounce actions to avoid rapid firing
  if (now() - lastActionTimestamp < ACTION_DEBOUNCE_MS) {
    log('Action debounced');
    return false;
  }
  lastActionTimestamp = now();

  // Strategy order:
  // 1. If skipAds and skip button visible -> click skip
  if (tryClickSkipButtonIfAllowed()) return true;

  // 2. Click player next if present
  if (tryClickPlayerNext()) return true;

  // 3. Try clicking next short link (single short page)
  if (tryClickNextShortLink()) return true;

  // 4. Scroll feed fallback
  if (tryScrollToNext()) return true;

  log('No next strategy succeeded');
  return false;
}

/* ============================
   Video monitoring: handlers
   ============================ */

function attachVideoListeners(video) {
  detachVideoListeners(); // ensure single binding
  if (!video) return;

  currentVideo = video;

  // timeupdate: watch for "near end" if ended event not reliable
  timeupdateHandler = () => {
    try {
      if (!currentVideo) return;
      const cur = currentVideo.currentTime || 0;
      const dur = currentVideo.duration || 0;
      if (!isFinite(dur) || dur <= 0) return;

      // if playing ad -> don't trigger
      if (isAdPlaying()) {
        // if configured to pause on unskippable ads, we won't do actions
        log('Ad detected during timeupdate; pausing actions');
        return;
      }

      const pct = (cur / dur) * 100;
      // If it's >= 98% or within 0.7s of end, consider it finished
      if (pct >= 98 || (dur - cur) <= 0.7) {
        // Only trigger if autoScroll enabled and network permits
        if (SETTINGS.autoScroll && networkAllows()) {
          log('Near end detected -> scheduling next');
          scheduleNextActionWithDelay();
        }
      }
    } catch (e) {}
  };

  // ended event (most reliable)
  endedHandler = () => {
    try {
      if (isAdPlaying()) {
        log('Ended but ad playing -> ignoring');
        return;
      }
      if (SETTINGS.autoScroll && networkAllows()) {
        log('Ended event -> scheduling next');
        scheduleNextActionWithDelay();
      }
    } catch (e) {}
  };

  video.addEventListener('timeupdate', timeupdateHandler, { passive: true });
  video.addEventListener('ended', endedHandler, { passive: true });

  log('Attached video listeners to', video);
}

function detachVideoListeners() {
  try {
    if (currentVideo) {
      if (timeupdateHandler) currentVideo.removeEventListener('timeupdate', timeupdateHandler);
      if (endedHandler) currentVideo.removeEventListener('ended', endedHandler);
    }
  } catch (e) {}
  currentVideo = null;
  timeupdateHandler = null;
  endedHandler = null;
}

/* ============================
   Scheduling with delay & ad guards
   ============================ */
let delayedActionTimer = null;
function scheduleNextActionWithDelay() {
  // clear existing
  if (delayedActionTimer) {
    clearTimeout(delayedActionTimer);
    delayedActionTimer = null;
  }

  const delay = clamp(Number(SETTINGS.delayMs) || 0, 0, 15000);

  delayedActionTimer = setTimeout(() => {
    try {
      // If ad playing and pauseOnUnskippableAds = true, do nothing
      if (isAdPlaying()) {
        log('Scheduled action aborted - ad playing');
        return;
      }
      // Execute next
      const ok = goToNextShort();
      log('goToNextShort executed:', ok);
    } catch (e) {
      log('Error in scheduled action', e);
    }
  }, delay);
}

/* ============================
   Init & MutationObserver
   ============================ */

function scanAndAttach() {
  // find visible video and attach
  const v = findVisibleVideo();
  if (v && v !== currentVideo) {
    attachVideoListeners(v);
  } else if (!v) {
    // no video found, detach
    detachVideoListeners();
  }
}

// Observe for DOM changes that may insert/remove the video element
function startMutationObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver((mutations) => {
    // On any significant change, re-scan for video
    scanAndAttach();
  });
  mutationObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
  log('MutationObserver started');
}

function stopMutationObserver() {
  try {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  } catch (e) {}
}

async function init() {
  if (initialized) return;
  initialized = true;

  log('init called');

  // Get settings from background
  try {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (resp) => {
      if (resp && resp.settings) {
        SETTINGS = Object.assign({}, SETTINGS, resp.settings);
        log('Initial settings loaded', SETTINGS);
      }
      // initial scan & attach
      scanAndAttach();
    });
  } catch (e) {
    log('Could not fetch settings, using defaults');
    scanAndAttach();
  }

  // Listen for runtime messages (settings updates etc.)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (!msg || !msg.action) return;
      if (msg.action === 'settingsUpdated' && msg.payload) {
        SETTINGS = Object.assign({}, SETTINGS, msg.payload);
        log('Settings updated in content script', SETTINGS);
        // If settings changed and autoScroll turned off, clear timers
        if (!SETTINGS.autoScroll) {
          if (delayedActionTimer) {
            clearTimeout(delayedActionTimer);
            delayedActionTimer = null;
          }
        }
        // Possibly re-scan
        scanAndAttach();
      }
    } catch (e) {}
    // no need to call sendResponse
  });

  // Start observer & initial scan
  startMutationObserver();

  // Periodic scan (in case MutationObserver misses something)
  setInterval(() => {
    scanAndAttach();
  }, 2000);
}

/* ============================
   Clean up on unload / navigation
   ============================ */

window.addEventListener('beforeunload', () => {
  detachVideoListeners();
  stopMutationObserver();
  if (delayedActionTimer) clearTimeout(delayedActionTimer);
});

/* ============================
   Launch init (idempotent)
   ============================ */

try {
  init();
} catch (err) {
  log('Initialization failed', err);
}

/* ============================
   Known limitations & notes (keep in code for future devs)
   ============================
 - YouTube DOM changes often. Selectors used here are heuristics and may break.
 - Clicking/automating UI elements can contravene YouTube's terms of service.
   We use policy-aware defaults: do not auto-skip ads unless user explicitly enables skipAds.
 - Some ads may be separate video elements — ad detection may not catch all cases.
 - For best reliability, use the combination of strategies: player-next click, next-link click, and smooth scroll.
 - If behavior seems flaky, check console for logs: prefix "[NextFlow:shorts]".
 - Consider adding telemetry (opt-in only) or remote configs if you want to handle DOM selector updates without publishing extension updates. Avoid any PII collection.
 ============================ */
