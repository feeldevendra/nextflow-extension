// background.js - MV3 service worker stub for NextFlow
// Minimal worker: listens for installs and receives simple messages.
// We'll expand this later with state management and script injection.

self.addEventListener('install', (event) => {
  // Service worker installed
  console.log('NextFlow service worker installed.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('NextFlow service worker activated.');
  // Claim clients so extension is active immediately
  event.waitUntil(self.clients.claim());
});

// Simple message handler (content/popup will communicate later)
self.addEventListener('message', (event) => {
  console.log('Background received message:', event.data);
  // Example: forward messages or handle global state
});
