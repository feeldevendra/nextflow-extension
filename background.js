// background.js - NextFlow MV3 service worker
// Responsibilities:
// - Manage default settings and storage
// - Listen to settings updates and broadcast to content scripts
// - Dynamically inject `content/shorts.js` into YouTube pages (Shorts feed & single shorts)
// - Handle runtime messages from popup/options/content scripts
// - Lightweight, safe, and production-oriented

// Default settings (single source of truth)
const DEFAULTS = {
  autoScroll: true,
  skipAds: false,
  delayMs: 500,
  onlyOnWifi: false,
  pauseOnUnskippableAds: true
};

// Helper: promisified chrome.storage (sync)
function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (res) => {
      resolve(res.settings || DEFAULTS);
    });
  });
}
function setStoredSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings }, () => resolve());
  });
}

// Utility: Check if a URL is YouTube Shorts (feed or single short)
function isYouTubeShortsUrl(url = '') {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Includes /shorts/ path OR watch?v= with short-like params (less common)
    return /\/shorts\//i.test(u.pathname) || /youtube\.com\/shorts/i.test(u.href);
  } catch (e) {
    return /\/shorts\//i.test(url);
  }
}

// Inject content script into a tab (if matches)
async function injectContentScriptIfNeeded(tabId, frameId = 0) {
  try {
    // Small guard: confirm tab still exists and URL matches
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || !isYouTubeShortsUrl(tab.url)) return false;

    // Use chrome.scripting.executeScript to inject content script (MV3)
    // This will run the file in the tab's top-level frame by default.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/shorts.js']
    });

    // After injection, send current settings immediately
    const settings = await getStoredSettings();
    chrome.tabs.sendMessage(tabId, { action: 'settingsUpdated', payload: settings }).catch(()=>{ /* ignore if no listener */ });

    console.log(`[NextFlow] Injected content/shorts.js into tab ${tabId}`);
    return true;
  } catch (err) {
    // Often fails if the tab is a chrome:// page, or scripting not allowed
    console.warn('[NextFlow] injectContentScriptIfNeeded error:', err?.message || err);
    return false;
  }
}

/* ---------- Event handlers ---------- */

// On install/upgrade: ensure defaults set and do any migrations if needed
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('NextFlow installed/updated:', details);
  const existing = await getStoredSettings();
  if (!existing || Object.keys(existing).length === 0) {
    await setStoredSettings(DEFAULTS);
    console.log('NextFlow: default settings saved.');
  } else {
    // Merge any missing keys (migration)
    const merged = Object.assign({}, DEFAULTS, existing);
    await setStoredSettings(merged);
    console.log('NextFlow: settings merged on install.');
  }
});

// When storage changes (user updated settings via popup/options), broadcast to all relevant tabs
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (changes.settings) {
    const newSettings = changes.settings.newValue;
    // Broadcast to all tabs that match YouTube (shorts)
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      for (const t of tabs) {
        // Best-effort: send message; content script may not be injected yet
        chrome.tabs.sendMessage(t.id, { action: 'settingsUpdated', payload: newSettings }).catch(()=>{/* no listener */});
      }
    });
  }
});

// Listen to runtime messages from popup/options/content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Basic sanity
    if (!msg || !msg.action) return;

    switch (msg.action) {
      case 'getSettings':
        {
          const s = await getStoredSettings();
          sendResponse({ ok: true, settings: s });
        }
        break;
      case 'setSettings':
        {
          const payload = msg.payload || {};
          // Merge with defaults to ensure shape
          const merged = Object.assign({}, DEFAULTS, payload);
          await setStoredSettings(merged);
          sendResponse({ ok: true });
        }
        break;
      case 'settingsUpdated':
        {
          // Received from popup/options (fire-and-forget) — forward to tab if present
          const payload = msg.payload || {};
          // Acknowledge quickly
          sendResponse({ ok: true });
          // Broadcast to all YouTube tabs (best-effort)
          chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            for (const t of tabs) {
              chrome.tabs.sendMessage(t.id, { action: 'settingsUpdated', payload }).catch(()=>{});
            }
          });
        }
        break;
      case 'injectIfNeeded':
        {
          // Content/popup can request on-demand injection for a given tabId
          const tabId = (sender.tab && sender.tab.id) || msg.tabId;
          if (tabId) {
            const injected = await injectContentScriptIfNeeded(tabId);
            sendResponse({ ok: injected });
          } else {
            sendResponse({ ok: false, reason: 'no-tab' });
          }
        }
        break;
      // Add more actions as needed
      default:
        // Unknown action — ignore
        break;
    }
  })();
  // Return true to indicate async response possible
  return true;
});

/* Tabs listeners:
   - When a tab updates (complete / URL change), try injection if it's a Shorts URL.
   - When a tab is activated (user switches tabs), try injection for active tab if Shorts.
*/
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only when URL or status changes to 'complete', check injection
  if ((changeInfo.status && changeInfo.status === 'complete') || changeInfo.url) {
    if (isYouTubeShortsUrl(tab.url)) {
      // Attempt to inject content script (best-effort)
      injectContentScriptIfNeeded(tabId);
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (isYouTubeShortsUrl(tab.url)) {
      injectContentScriptIfNeeded(tab.id);
    }
  } catch (err) {
    // ignore
  }
});

/* Clean shutdown/logging for debugging */
self.addEventListener('activate', (event) => {
  console.log('NextFlow service worker activated.');
});
self.addEventListener('install', (event) => {
  console.log('NextFlow service worker installed.');
});
