/**
 * DeepSeek Platform Strategy
 *
 * Implements the HopperPlatform interface for DeepSeek.
 * Handles obfuscated class names and dynamic DOM updates typical of this platform.
 * Uses robust fallback selectors to maintain stability across UI updates.
 */
(function () {
  'use strict';

  // Export platform API
  window.HopperPlatform = window.HopperPlatform || {};

  window.HopperPlatform.deepseek = {
    name: 'DeepSeek',
    hostnames: ['chat.deepseek.com', 'www.deepseek.com', 'deepseek.com'],

    /**
     * Determines if the current environment is the DeepSeek platform.
     * @returns {boolean} True if the hostname matches DeepSeek domains.
     */
    isActive: function () {
      return this.hostnames.includes(window.location.hostname);
    },

    /**
     * Scans the DOM to identify and parse chat messages.
     *
     * Strategy:
     * 1. Resolves the main scroll container using stable or obfuscated class selectors.
     * 2. Aggregates all message elements (user and assistant) into a single list.
     * 3. Sorts elements by DOM position to ensure chronological order.
     * 4. Classifies messages by role using content heuristics and class signatures.
     *
     * @returns {Array} Array of normalized message objects.
     */
    detectMessages: function () {
      try {
        // Container Resolution:
        // Attempt to locate the scrollable area using standard and obfuscated class names.
        let container = document.querySelector('.ds-scroll-area');
        if (!container) {
          container = document.querySelector('[class*="ds-scroll-area"]');
        }
        if (!container) {
          container = document.querySelector('[class*="_0f72b0b"]'); // Obfuscated fallback
        }
        if (!container) {
          container = document.querySelector('main');
        }
        if (!container) {
          container = document.body;
        }

        const newMessages = [];

        // Message Aggregation:
        // Collect all potential message nodes using a broad set of selectors to catch
        // both standard and obfuscated elements.
        let messageElements = container.querySelectorAll('.ds-message');
        if (messageElements.length === 0) {
          messageElements = container.querySelectorAll('[class*="ds-message"]');
        }
        if (messageElements.length === 0) {
          messageElements = document.querySelectorAll('.ds-message');
        }
        if (messageElements.length === 0) {
          messageElements = document.querySelectorAll('[class*="ds-message"]');
        }

        // Fallback Aggregation:
        // If standard selectors fail, target specific obfuscated signatures for user/assistant content.
        if (messageElements.length === 0) {
          messageElements = container.querySelectorAll('.fbb737a4, [class*="fbb737a4"]'); // User signature

          if (messageElements.length === 0) {
            // Assistant signatures
            messageElements = container.querySelectorAll('._4f9bf79, [class*="_4f9bf79"], ._43c05b5, [class*="_43c05b5"]');
          }
        }

        // Chronological Sorting:
        // Ensure messages are processed in visual order by comparing their DOM positions.
        const sortedElements = Array.from(messageElements).sort((a, b) => {
          try {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
              return -1;
            }
            if (position & Node.DOCUMENT_POSITION_PRECEDING) {
              return 1;
            }
          } catch (e) {
            return (a.offsetTop || 0) - (b.offsetTop || 0);
          }
          return 0;
        });

        let messageOrder = 0;

        sortedElements.forEach((msgEl, index) => {
          try {
            let role = null;
            let content = '';
            let scrollElement = msgEl;

            // Role Classification:
            // Identify user messages via specific class signatures.
            const userContent = msgEl.querySelector('.fbb737a4') ||
              msgEl.querySelector('[class*="fbb737a4"]');

            if (userContent) {
              role = 'user';
              content = userContent.textContent.trim();
            } else {
              // Identify assistant messages via markdown containers or specific parent classes.
              const markdownContent = msgEl.querySelector('.ds-markdown') ||
                msgEl.querySelector('[class*="ds-markdown"]');

              const assistantContainer = msgEl.closest('._4f9bf79') ||
                msgEl.closest('[class*="_4f9bf79"]') ||
                msgEl.closest('._43c05b5') ||
                msgEl.closest('[class*="_43c05b5"]');

              if (markdownContent) {
                role = 'assistant';
                content = markdownContent.textContent.trim();
              } else if (assistantContainer) {
                role = 'assistant';
                content = msgEl.textContent.trim();
              } else {
                // Heuristic Fallback: Check for markdown class presence
                const hasMarkdownClass = msgEl.classList.toString().includes('ds-markdown') ||
                  msgEl.querySelector('[class*="markdown"]');
                if (hasMarkdownClass) {
                  role = 'assistant';
                  content = msgEl.textContent.trim();
                }
              }
            }

            if (content) {
              content = content.replace(/\s+/g, ' ').trim();
            }

            if (!role || !content || content.length < 1) {
              return;
            }

            const contentHash = content.substring(0, 50).replace(/\s/g, '').substring(0, 20);
            const id = `msg-deepseek-${role}-${index}-${contentHash}`;

            // Scroll Target Optimization:
            // For assistant messages, target the outer container for better scroll alignment.
            if (role === 'assistant') {
              const assistantContainer = msgEl.closest('._4f9bf79') ||
                msgEl.closest('[class*="_4f9bf79"]') ||
                msgEl.closest('._43c05b5') ||
                msgEl.closest('[class*="_43c05b5"]');
              if (assistantContainer) {
                scrollElement = assistantContainer;
              }
            }

            newMessages.push({
              id,
              role: role,
              content: content.substring(0, 200),
              fullContent: content,
              element: scrollElement,
              timestamp: Date.now(),
              order: messageOrder++
            });
          } catch (err) {
            console.error(`Hopper [DeepSeek]: Error processing message ${index}:`, err);
          }
        });

        return newMessages;
      } catch (error) {
        console.error('ZeroScroll [DeepSeek]: Error detecting messages:', error);
        return [];
      }
    },

    /**
     * Resolves the main scrollable container.
     * Uses a heuristic approach to find the common ancestor of message elements
     * if the standard container selectors fail.
     */
    getContainer: function () {
      let container = document.querySelector('.ds-scroll-area');
      if (!container) {
        container = document.querySelector('[class*="ds-scroll-area"]');
      }
      if (!container) {
        container = document.querySelector('[class*="_0f72b0b"]');
      }
      if (!container) {
        // Ancestor Traversal Strategy:
        // Find the lowest common ancestor of all detected message elements.
        const testMessages = document.querySelectorAll('.ds-message');
        if (testMessages.length > 0) {
          let commonParent = testMessages[0].parentElement;
          for (let i = 1; i < Math.min(5, testMessages.length); i++) {
            let current = testMessages[i];
            while (current && current !== commonParent && !commonParent.contains(current)) {
              current = current.parentElement;
            }
            if (current === commonParent) {
              commonParent = current.parentElement;
            }
          }
          if (commonParent) {
            container = commonParent;
          }
        }
      }
      if (!container) {
        container = document.querySelector('main');
      }
      if (!container) {
        container = document.body;
      }
      return container;
    },

    /**
     * Returns the CSS selectors used to identify message elements.
     * Includes both semantic classes and obfuscated signatures.
     */
    getMessageSelector: function () {
      return '.ds-message, [class*="ds-message"], .fbb737a4, .ds-markdown, [class*="_4f9bf79"], [class*="_43c05b5"]';
    },

    /**
     * Checks if the platform is currently in a streaming state.
     * Monitors active loading indicators within the viewport.
     *
     * @returns {boolean} True if active streaming is detected.
     */
    isStreaming: function () {
      try {
        const streamingIndicators = document.querySelectorAll('[class*="streaming"], [class*="typing"], [class*="loading"], [class*="generating"]');
        const viewportBottom = window.innerHeight;

        for (const indicator of streamingIndicators) {
          const rect = indicator.getBoundingClientRect();
          const style = window.getComputedStyle(indicator);
          if (rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden') {
            // Viewport Proximity Check:
            // Ignore indicators that are far above the viewport (historical messages).
            if (rect.top < viewportBottom + 500 && rect.bottom > -500) {
              return true;
            }
          }
        }
        return false;
      } catch (error) {
        return false;
      }
    },

    /**
     * Returns the debounce time for DOM observation.
     * DeepSeek requires a fast debounce (300ms) for responsive updates.
     */
    getDebounceTime: function () {
      return 300;
    },

    /**
     * Returns the wait time after initial detection.
     */
    getStreamingWaitTime: function () {
      return 1500;
    },

    /**
     * Normalizes the current URL to detect conversation context switches.
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
