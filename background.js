/**
 * Background Service Worker
 *
 * Manages persistent storage coordination for the Hopper extension.
 * Handles message passing between content scripts and chrome.storage API.
 * Maintains messages, favorites, and theme preferences across sessions.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Hopper installed');
});

/**
 * Message Handler
 *
 * Processes requests from content scripts for storage operations.
 * Supported message types:
 * - SAVE_MESSAGES: Persist detected messages to storage
 * - GET_MESSAGES: Retrieve stored messages
 * - SAVE_FAVORITES: Persist favorited messages
 * - GET_FAVORITES: Retrieve favorited messages
 * - GET_THEME: Retrieve user theme preference
 * - SAVE_THEME: Persist user theme preference
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_MESSAGES') {
    chrome.storage.local.set({ messages: request.messages }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === 'GET_MESSAGES') {
    chrome.storage.local.get(['messages'], (result) => {
      sendResponse({ messages: result.messages || [] });
    });
    return true;
  }

  if (request.type === 'SAVE_FAVORITES') {
    chrome.storage.local.set({ favorites: request.favorites }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'GET_FAVORITES') {
    chrome.storage.local.get(['favorites'], (result) => {
      sendResponse({ favorites: result.favorites || [] });
    });
    return true;
  }

  if (request.type === 'GET_THEME') {
    chrome.storage.local.get(['hopperTheme'], (result) => {
      sendResponse({ theme: result.hopperTheme || 'dark' });
    });
    return true;
  }

  if (request.type === 'SAVE_THEME') {
    chrome.storage.local.set({ hopperTheme: request.theme }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

