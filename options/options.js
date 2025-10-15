// options.js - manage options page: load/save/export/import/reset
const DEFAULTS = {
  autoScroll: true,
  skipAds: false,
  delayMs: 500,
  onlyOnWifi: false,
  pauseOnUnskippableAds: true
};

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const optAuto = document.getElementById('optAuto');
  const optDelay = document.getElementById('optDelay');
  const optLoopSafe = document.getElementById('optLoopSafe');
  const optSkipAds = document.getElementById('optSkipAds');
  const optAdPause = document.getElementById('optAdPause');

  const btnExport = document.getElementById('btnExport');
  const fileImport = document.getElementById('fileImport');
  const btnImport = document.getElementById('btnImport');
  const btnReset = document.getElementById('btnReset');
  const btnSave = document.getElementById('btnSave');
  const statusText = document.getElementById('statusText');
  const privacyLink = document.getElementById('privacyLink');
  const githubLink = document.getElementById('githubLink');

  // Set links (update when hosting)
  privacyLink.href = 'https://your-site.example/privacy.html';
  githubLink.href = 'https://github.com/yourusername/nextflow';

  // Load current settings
  const data = await getStorage(['settings']);
  const s = data.settings || DEFAULTS;

  // populate fields
  optAuto.checked = Boolean(s.autoScroll);
  optDelay.value = s.delayMs ?? DEFAULTS.delayMs;
  optLoopSafe.checked = Boolean(s.onlyOnWifi);
  optSkipAds.checked = Boolean(s.skipAds);
  optAdPause.checked = Boolean(s.pauseOnUnskippableAds);

  // Save button
  btnSave.addEventListener('click', async () => {
    const next = {
      autoScroll: !!optAuto.checked,
      delayMs: Number(optDelay.value) || DEFAULTS.delayMs,
      onlyOnWifi: !!optLoopSafe.checked,
      skipAds: !!optSkipAds.checked,
      pauseOnUnskippableAds: !!optAdPause.checked
    };
    await setStorage({ settings: next });
    // Notify background/content
    chrome.runtime.sendMessage({ action: 'settingsUpdated', payload: next });
    flashStatus('Saved');
  });

  // Export settings
  btnExport.addEventListener('click', async () => {
    const current = (await getStorage(['settings'])).settings || DEFAULTS;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nextflow-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashStatus('Exported');
  });

  // Import settings (select file then click apply)
  btnImport.addEventListener('click', async () => {
    if (!fileImport.files || !fileImport.files.length) return flashStatus('Select a file first', true);
    const file = fileImport.files[0];
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      // Basic validation
      if (typeof obj !== 'object') throw new Error('Invalid JSON');
      // Merge with defaults to ensure shape
      const next = Object.assign({}, DEFAULTS, obj);
      await setStorage({ settings: next });
      chrome.runtime.sendMessage({ action: 'settingsUpdated', payload: next });
      // Update UI
      optAuto.checked = !!next.autoScroll;
      optDelay.value = next.delayMs;
      optLoopSafe.checked = !!next.onlyOnWifi;
      optSkipAds.checked = !!next.skipAds;
      optAdPause.checked = !!next.pauseOnUnskippableAds;
      flashStatus('Imported');
    } catch (err) {
      console.error(err);
      flashStatus('Invalid file', true);
    }
  });

  // Reset
  btnReset.addEventListener('click', async () => {
    if (!confirm('Reset all NextFlow settings to defaults?')) return;
    await setStorage({ settings: DEFAULTS });
    chrome.runtime.sendMessage({ action: 'settingsUpdated', payload: DEFAULTS });
    // update UI
    optAuto.checked = DEFAULTS.autoScroll;
    optDelay.value = DEFAULTS.delayMs;
    optLoopSafe.checked = DEFAULTS.onlyOnWifi;
    optSkipAds.checked = DEFAULTS.skipAds;
    optAdPause.checked = DEFAULTS.pauseOnUnskippableAds;
    flashStatus('Reset');
  });

  // Small helper to show temporary status
  function flashStatus(text, isError = false) {
    statusText.textContent = text;
    statusText.style.color = isError ? 'var(--danger)' : '#111';
    setTimeout(() => {
      statusText.textContent = 'Ready';
      statusText.style.color = '';
    }, 1800);
  }
});

/* Storage helpers (Promise wrappers) */
function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, (res) => resolve(res)));
}
function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, () => resolve()));
}
