/**
 * ChatGPT Platform Strategy
 *
 * Implements the HopperPlatform interface for OpenAI's ChatGPT.
 * Encapsulates all platform-specific DOM selectors and parsing logic.
 * Execution is isolated to prevent side effects on other platforms.
 */
(function () {
  'use strict';

  // Export platform API
  window.HopperPlatform = window.HopperPlatform || {};

  window.HopperPlatform.chatgpt = {
    name: 'ChatGPT',
    hostnames: ['chat.openai.com', 'chatgpt.com'],

    /**
     * Determines if the current environment is the ChatGPT platform.
     * @returns {boolean} True if the hostname matches ChatGPT domains.
     */
    isActive: function () {
      return this.hostnames.includes(window.location.hostname);
    },

    /**
     * Scans the DOM to identify and parse chat messages.
     *
     * Strategies:
     * 1. Locates the main chat container.
     * 2. Iterates through nodes with 'data-message-author-role'.
     * 3. Extracts text content using a fallback chain of selectors.
     *
     * @returns {Array} Array of normalized message objects.
     */
    detectMessages: function () {
      try {
        const container = document.querySelector('main');
        if (!container) {
          return [];
        }

        const messageElements = container.querySelectorAll('[data-message-author-role]');
        const newMessages = [];

        messageElements.forEach((el, index) => {
          const roleAttr = el.getAttribute('data-message-author-role');
          if (!roleAttr) return;

          const role = roleAttr; // 'user' or 'assistant'

          // Content Extraction Strategy:
          // Attempt to resolve message content using a prioritized list of selectors
          // to handle various message states (e.g., code blocks, editing mode).
          let content = '';

          // Priority 1: Pre-formatted whitespace (common for code/structured text)
          const whitespaceEl = el.querySelector('.whitespace-pre-wrap');
          if (whitespaceEl && whitespaceEl.textContent.trim().length > 0) {
            content = whitespaceEl.textContent.trim();
          }

          // Priority 2: Standard Markdown container
          if (!content || content.length < 1) {
            const markdownEl = el.querySelector('.markdown');
            if (markdownEl && markdownEl.textContent.trim().length > 0) {
              content = markdownEl.textContent.trim();
            }
          }

          // Priority 3: Base text container
          if (!content || content.length < 1) {
            const textBaseEl = el.querySelector('.text-base');
            if (textBaseEl && textBaseEl.textContent.trim().length > 0) {
              content = textBaseEl.textContent.trim();
            }
          }

          // Priority 4: Fallback to generic message class or element text
          if (!content || content.length < 1) {
            const messageContent = el.querySelector('[class*="message"]') || el;
            content = messageContent.textContent.trim();
          }

          // Normalize whitespace
          content = content.replace(/\s+/g, ' ').trim();

          if (!content || content.length < 1) {
            return;
          }

          // Generate a stable ID based on role, index, and content hash
          const contentHash = content.substring(0, 50).replace(/\s/g, '').substring(0, 20);
          const id = `msg-chatgpt-${role}-${index}-${contentHash}`;

          newMessages.push({
            id,
            role: role,
            content: content.substring(0, 200), // Preview for sidebar
            fullContent: content,
            element: el,
            timestamp: Date.now()
          });
        });

        return newMessages;
      } catch (error) {
        console.error('ZeroScroll [ChatGPT]: Error detecting messages:', error);
        return [];
      }
    },

    /**
     * Returns the main scrollable container for the chat interface.
     * Used by the core logic to attach scroll listeners.
     */
    getContainer: function () {
      return document.querySelector('main');
    },

    /**
     * Returns the CSS selector used to identify individual message elements.
     */
    getMessageSelector: function () {
      return '[data-message-author-role]';
    },

    /**
     * Normalizes the current URL to detect conversation context switches.
     * Strips hash fragments and trailing slashes to ensure stable comparison.
     *
     * @param {string} url - The raw URL to normalize.
     * @returns {string} The normalized path and search query.
     */
    normalizeUrl: function (url) {
      try {
        const u = new URL(url);
        return u.pathname + (u.search || '');
      } catch {
        return url.split('#')[0].replace(/\/$/, '');
      }
    }
  };
})();

