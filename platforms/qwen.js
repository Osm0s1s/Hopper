/**
 * Qwen Platform Strategy
 *
 * Implements the HopperPlatform interface for Alibaba Cloud's Qwen.
 * Uses predictable ID patterns (message-*) and class-based role classification.
 * Employs post-detection sorting to maintain chronological message order.
 */
(function () {
  'use strict';

  window.HopperPlatform = window.HopperPlatform || {};

  window.HopperPlatform.qwen = {
    name: 'Qwen',
    hostnames: ['chat.qwen.ai', 'qwen.ai'],

    /**
     * Determines if the current environment is the Qwen platform.
     * @returns {boolean} True if the hostname includes Qwen domains.
     */
    isActive: function () {
      return this.hostnames.some(host => window.location.hostname.includes(host));
    },

    /**
     * Scans the DOM to identify and parse chat messages.
     *
     * Strategy:
     * 1. Collects all message elements via predictable ID pattern (message-*).
     * 2. Filters out non-message elements (input containers, buttons).
     * 3. Classifies role using class signatures (user-message vs response-meesage-container).
     * 4. Extracts content using cascading selector strategies.
     * 5. Sorts messages by DOM position to ensure chronological order.
     *
     * @returns {Array} Array of normalized message objects.
     */
    detectMessages: function () {
      try {
        // Container Resolution: Multiple fallback strategies
        let container = document.querySelector('.chat-messages-container');
        if (!container) {
          container = document.querySelector('[class*="chat-messages"]');
        }
        if (!container) {
          container = document.querySelector('main');
        }
        if (!container) {
          container = document.body;
        }

        const messages = [];
        let order = 0;
        const seen = new Set();

        // Message Aggregation: Query all message elements from document
        const allMessages = document.querySelectorAll('div[id^="message-"]');

        allMessages.forEach((msgEl, idx) => {
          try {
            const msgId = msgEl.id;
            if (!msgId || seen.has(msgId)) {
              return;
            }

            // Filter: Skip non-message elements
            if (msgId.includes('input-container') || msgId.includes('button-') || msgId.includes('language')) {
              return;
            }

            // Role Classification: Determine role based on classes and content signatures
            const hasUserClass = msgEl.classList.contains('user-message');
            const hasResponseClass = msgEl.classList.contains('response-meesage-container') ||
              msgEl.classList.contains('response-message-container');
            const hasResponseContent = msgEl.querySelector('.response-message-body, .markdown-content-container, .text-response-render-container') !== null;

            const isUserMessage = hasUserClass;
            const isAssistantMessage = hasResponseClass || hasResponseContent;

            if (!isUserMessage && !isAssistantMessage) {
              return;
            }

            seen.add(msgId);

            let role, content;

            if (isUserMessage) {
              role = 'user';
              // User Content Extraction: Cascading selector strategy
              let contentEl = msgEl.querySelector('.user-message-text-content p.user-message-content.whitespace-pre-wrap');
              if (!contentEl) {
                contentEl = msgEl.querySelector('p.user-message-content.whitespace-pre-wrap');
              }
              if (!contentEl) {
                contentEl = msgEl.querySelector('p.user-message-content');
              }
              if (!contentEl) {
                contentEl = msgEl.querySelector('[class*="user-message-content"]');
              }
              if (!contentEl) {
                const textContainer = msgEl.querySelector('.user-message-text-content');
                if (textContainer) {
                  const clone = textContainer.cloneNode(true);
                  clone.querySelectorAll('button, svg, .message-footer, [class*="button"], [class*="footer"]').forEach(el => el.remove());
                  content = clone.textContent.trim();
                } else {
                  // Fallback: Extract from message wrapper
                  const clone = msgEl.cloneNode(true);
                  clone.querySelectorAll('button, svg, .message-footer, [class*="button"], [class*="footer"], [class*="action"]').forEach(el => el.remove());
                  content = clone.textContent.trim();
                }
              } else {
                content = contentEl.textContent.trim();
              }
            } else {
              role = 'assistant';
              // Assistant Content Extraction: Try content container selectors
              let contentContainer = msgEl.querySelector('#response-content-container.markdown-content-container');
              if (!contentContainer) {
                contentContainer = msgEl.querySelector('.markdown-content-container.markdown-prose');
              }
              if (!contentContainer) {
                contentContainer = msgEl.querySelector('.text-response-render-container');
              }
              if (!contentContainer) {
                contentContainer = msgEl.querySelector('.markdown-content-container');
              }
              if (!contentContainer) {
                const responseBody = msgEl.querySelector('.response-message-body');
                if (responseBody) {
                  const clone = responseBody.cloneNode(true);
                  clone.querySelectorAll('button, svg, .message-footer, [class*="button"], [class*="footer"]').forEach(el => el.remove());
                  content = clone.textContent.trim();
                } else {
                  // Last resort: Extract from entire message element
                  const clone = msgEl.cloneNode(true);
                  clone.querySelectorAll('button, svg, .message-footer, [class*="button"], [class*="footer"], [class*="action"]').forEach(el => el.remove());
                  content = clone.textContent.trim();
                }
              } else {
                const clone = contentContainer.cloneNode(true);
                clone.querySelectorAll('button, svg, .message-footer, [class*="button"], [class*="footer"], [class*="action"]').forEach(el => el.remove());
                content = clone.textContent.trim();
              }
            }

            if (!content || content.length < 1) {
              return;
            }

            const contentHash = content.substring(0, 50).replace(/\s/g, '').substring(0, 20);
            const id = `msg-qwen-${role}-${order}-${contentHash}`;

            messages.push({
              id,
              role,
              content: content.substring(0, 200),
              fullContent: content,
              element: msgEl,
              timestamp: Date.now(),
              order: order++
            });
          } catch (err) {
            console.error('Hopper [Qwen]: Error processing message:', err);
          }
        });

        // Chronological Sorting: Sort by DOM position
        messages.sort((a, b) => {
          const aPos = a.element.compareDocumentPosition(b.element);
          return aPos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // Reassign order based on sorted position
        messages.forEach((msg, idx) => {
          msg.order = idx;
        });

        return messages;
      } catch (error) {
        console.error('Hopper [Qwen]: Error detecting messages:', error);
        return [];
      }
    },

    /**
     * Returns the main scrollable container for the chat interface.
     */
    getContainer: function () {
      return document.querySelector('.chat-messages-container') ||
        document.querySelector('[class*="chat-messages"]') ||
        document.querySelector('main') ||
        document.body;
    },

    /**
     * Returns the CSS selectors used to identify message elements.
     */
    getMessageSelector: function () {
      return 'div.user-message[id^="message-"], div[id^="message-"][class*="response-meesage-container"]';
    },

    /**
     * Checks if the platform is currently in a streaming state.
     * Monitors assistant messages for loading or streaming indicators.
     *
     * @returns {boolean} True if active streaming is detected.
     */
    isStreaming: function () {
      try {
        const assistantMessages = document.querySelectorAll('div[id^="message-"][class*="response-meesage-container"]');
        for (const msg of assistantMessages) {
          const contentContainer = msg.querySelector('#response-content-container, .markdown-content-container');
          if (contentContainer) {
            const hasLoading = msg.querySelector('[class*="loading"], [class*="streaming"], [aria-busy="true"]');
            if (hasLoading) {
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
     * Returns the debounce time for DOM observation (400ms).
     */
    getDebounceTime: function () {
      return 400;
    },

    /**
     * Returns the wait time after initial detection (1500ms).
     */
    getStreamingWaitTime: function () {
      return 1500;
    },

    /**
     * Normalizes the current URL to detect conversation context switches.
     * Extracts conversation ID from path pattern /c/{id}.
     */
    normalizeUrl: function (url) {
      try {
        const u = new URL(url);
        const pathMatch = u.pathname.match(/\/c\/([^\/]+)/);
        if (pathMatch) {
          return `/c/${pathMatch[1]}`;
        }
        return u.pathname + (u.search || '');
      } catch {
        return url.split('#')[0].replace(/\/$/, '');
      }
    }
  };
})();

