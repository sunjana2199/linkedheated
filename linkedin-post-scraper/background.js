// Relay messages from content script to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'progress' || message.type === 'done' || message.type === 'error') {
    // Store latest state so popup can read it even if it was closed/reopened
    chrome.storage.local.set({ scraperState: message });
  }
  return false;
});
