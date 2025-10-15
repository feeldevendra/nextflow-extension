// popup.js - manage UI, chrome.storage and messaging to background
// NOTE: relative path to chrome APIs assumes this is run as extension popup.

const DEFAULTS = {
  autoScroll: true,
  skipAds: false,
  delayMs: 500
};

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const toggleAuto = document.getElementById('toggleAuto');
  const toggleSkipAds = document.getElementById('toggleSkipAds');
  const delayRange = document.getElementById('delayRange');
  const delayValue = document.getElementById('delayValue');
  const pageStatus = document.getElementById('pageStatus');
  const openOptions = document.getElementById('openOptions');
  const toggleQuick = document.getElementById('toggleQuick');

  // Load settings from chrome.storage
  const stored = await getStorage(['settings']);
  const settings = stored.settings || DEFAULTS;

  // Initialize UI
  toggleAuto.checked = Boolean(settings.autoScroll);
  toggleAuto.setAttribute('aria-checked', toggleAuto.checked);
  toggleSkipAds.checked = Boolean(settings.skipAds);
  toggleSkipAds.setAttribute('aria-checked', toggleSkipAds.checked);
  delayRange.value = settings.delayMs ?? DEFAULTS.delayMs;
  delayValue.textContent = `${delayRange.value} ms`;

  // Update page status (is active tab youtube short?)
  updatePageStatus(pageStatus);

  // Event listeners - save on change (immediate save)
  toggleAuto.addEventListener('change', () => {
    const val = toggleAuto.checked;
    toggleAuto.setAttribute('aria-checked', val);
    saveSettingsAndNotify({ autoScroll: val });
  });

  toggleSkipAds.addEventListener('change', () => {
    const val = toggleSkipAds.checked;
    toggleSkipAds.setAttribute('aria-checked', val);
    saveSettingsAndNotify({ skipAds: val });
  });

  delayRange.addEventListener('input', () => {
    delayValue.textContent = `${delayRange.value} ms`;
  });

  delayRange.addEventListener('change', () => {
    const val = Number(delayRange.value);
    saveSettingsAndNotify({ delayMs: val });
  });

  openOptions.addEventListener('click', () => {
    // Open options page
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL('options/options.html'));
  });

  toggleQuick.addEventListener('click', () => {
    // Quick toggle: flip autoScroll
    const newVal = !toggleAuto.checked;
    toggleAuto.checked = newVal;
    toggleAuto.setAttribute('aria-checked', newVal);
    saveSettingsAndNotify({ autoScroll: newVal });
  });

  // Listen for storage updates from other contexts
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' || area === 'local') {
      if (changes.settings) {
        const newS = changes.settings.newValue;
        // update UI if different
        if (typeof newS.autoScroll === 'boolean') {
          toggleAuto.checked = newS.autoScroll;
          toggleAuto.setAttribute('aria-checked', newS.autoScroll);
        }
        if (typeof newS.skipAds === 'boolean') {
          toggleSkipAds.checked = newS.skipAds;
          toggleSkipAds.setAttribute('aria-checked', newS.skipAds);
        }
        if (typeof newS.delayMs === 'number') {
          delayRange.value = newS.delayMs;
          delayValue.textContent = `${newS.delayMs} ms`;
        }
      }
    }
  });
});

/* -------------------
   Helper functions
   ------------------- */

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (data) => resolve(data));
  });
}

function setStorage(obj) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(obj, () => resolve());
  });
}

async function saveSettingsAndNotify(patch) {
  // Merge with current settings
  const data = await getStorage(['settings']);
  const current = data.settings || {};
  const next = Object.assign({}, DEFAULTS, current, patch);
  await setStorage({ settings: next });

  // Notify background / content scripts about updated settings
  // This is a fire-and-forget; background will route messages to content if needed.
  chrome.runtime.sendMessage({ action: 'settingsUpdated', payload: next }, (resp) => {
    // optional response handling
    // console.log('Background ack:', resp);
  });
}

/* Update pageStatus text by checking active tab URL (requires activeTab permission) */
function updatePageStatus(el) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        el.textContent = 'No active tab';
        return;
      }
      const tab = tabs[0];
      const url = tab.url || '';
      if (/^(https?:\/\/)?(www\.)?youtube\.com\/shorts/i.test(url) || /\/shorts\//i.test(url)) {
        el.textContent = 'On YouTube Shorts';
        el.style.background = 'linear-gradient(90deg,var(--accent1-start),var(--accent1-end))';
        el.style.color = '#fff';
      } else if (/youtube\.com/i.test(url)) {
        el.textContent = 'On YouTube (not Shorts)';
      } else {
        el.textContent = 'Not on YouTube';
      }
    });
  } catch (err) {
    el.textContent = 'Status unknown';
  }
}
