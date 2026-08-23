// MV3 service worker kept intentionally small. Persistent trading state belongs to the local engine.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ paperTradingLabInstalled: true });
});
