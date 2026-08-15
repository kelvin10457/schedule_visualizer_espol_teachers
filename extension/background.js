// Service worker: content-script.js no puede llamar chrome.downloads ni chrome.tabs.create
// directamente, así que le pide a este background que lo haga por él.

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "DOWNLOAD_CSV") {
    chrome.downloads.download({ url: msg.dataUrl, filename: msg.filename, saveAs: false });
  }

  if (msg.type === "OPEN_RESULTS") {
    chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html#/show-schedule") });
  }
});
