/**
 * Claude Platform Strategy
 *
 * Implements the HopperPlatform interface for Anthropic's Claude.
 * Handles the unique "turn-based" DOM structure where user messages and
 * assistant responses are grouped or sequenced in specific patterns.
 * Includes robust logic for detecting streaming states and incomplete responses.
 */
(function () {
  'use strict';

  // Export platform API
  window.HopperPlatform = window.HopperPlatform || {};

  window.HopperPlatform.claude = {
    name: 'Claude',
    hostnames: ['claude.ai'],

    /**
     * Determines if the current environment is the Claude platform.
     * @returns {boolean} True if the hostname matches Claude domains.
     */
    isActive: function () {
      return this.hostnames.includes(window.location.hostname);
    },

    /**
     * Scans the DOM to identify and parse chat messages.
     *
     * Strategy:
     * 1. Identifies the main conversation container.
     * 2. Locates all user messages first to establish the conversation skeleton.
     * 3. For each user message, heuristically locates the corresponding assistant response
     *    by analyzing sibling elements and DOM proximity.
     * 4. Aggregates fragmented assistant response blocks into single coherent messages.
     *
     * @returns {Array} Array of normalized message objects.
     */
    detectMessages: function () {
      try {
        // Container Resolution Strategy:
        // Attempt to find the specific conversation list container, falling back to broader
        // containers if the specific one is not found (e.g., due to UI updates).
        let container = document.querySelector('[data-testid="conversation-turn-list"]');
        if (!container) {
          container = document.querySelector('main');
        }
        if (!container) {
          container = document.querySelector('[class*="conversation"]');
        }
        if (!container) {
          container = document.body;
        }

        const newMessages = [];

        // User Message Detection:
        // Establish the conversation flow by locating all user inputs first.
        // We prioritize specific test IDs for reliability.
        let userElements = container.querySelectorAll('[data-testid="user-message"]');
        if (userElements.length === 0) {
          userElements = document.querySelectorAll('[data-testid="user-message"]');
        }
        if (userElements.length === 0) {
          userElements = container.querySelectorAll('[data-testid="chat-user-message-content"]');
        }
        if (userElements.length === 0) {
          userElements = document.querySelectorAll('[data-testid="chat-user-message-content"]');
        }

        // Message Pairing Logic:
        // Claude's DOM often groups a user message and its response. We iterate through
        // user messages and look for the associated assistant response immediately following it.
        let messageOrder = 0;

        Array.from(userElements).forEach((userEl, userIndex) => {
          try {
            // Process User Message
            const userContent = (userEl.textContent || userEl.innerText || '').trim().replace(/\s+/g, ' ');

            if (userContent.length >= 1) {
              const contentHash = userContent.substring(0, 50).replace(/\s/g, '').substring(0, 20);
              const userId = `msg-claude-user-${userIndex}-${contentHash}`;

              newMessages.push({
                id: userId,
                role: 'user',
                content: userContent.substring(0, 200),
                fullContent: userContent,
                element: userEl,
                timestamp: Date.now(),
                order: messageOrder++
              });
            }
          } catch (err) {
            console.error('Hopper [Claude]: Error processing user message:', err);
          }

          // Process Assistant Response
          try {
            let assistantBlocks = [];

            // Heuristic A: Sibling Traversal
            // Navigate up to the message container and inspect subsequent siblings.
            // This handles the common "Turn Container -> User Div + Assistant Div" structure.
            let current = userEl;
            let depth = 0;
            const maxDepth = 10;

            while (current && depth < maxDepth) {
              const parent = current.parentElement;
              if (!parent) break;

              const parentSiblings = parent.parentElement ? Array.from(parent.parentElement.children) : [];
              const parentIndex = parentSiblings.indexOf(parent);

              // Inspect next few siblings for assistant content
              for (let i = parentIndex + 1; i < parentSiblings.length && i < parentIndex + 5; i++) {
                const sibling = parentSiblings[i];

                // Stop if we encounter the next user message
                if (Array.from(userElements).includes(sibling)) {
                  break;
                }

                // Check for known assistant message selectors
                const assistantSelectors = [
                  '[data-testid="chat-assistant-message-content"]',
                  '[data-testid="assistant-message"]',
                  '.assistant-message',
                  '[data-role="assistant"]',
                  'div[class*="assistant"]',
                  '.claude-response',
                  'div[class*="claude"]',
                  'div[class*="response"]'
                ];

                for (const selector of assistantSelectors) {
                  const blocks = sibling.querySelectorAll ? sibling.querySelectorAll(selector) : [];
                  if (blocks.length > 0) {
                    Array.from(blocks).forEach(block => {
                      if (!assistantBlocks.includes(block)) {
                        assistantBlocks.push(block);
                      }
                    });
                  }
                }

                // Fallback: Check if the sibling itself appears to be an assistant message
                // based on content length and lack of user-specific classes.
                const siblingText = (sibling.textContent || '').trim();
                if (siblingText.length > 20 &&
                  sibling.offsetHeight > 30 &&
                  !Array.from(userElements).includes(sibling)) {
                  const classList = sibling.classList.toString().toLowerCase();
                  if (!classList.includes('user') && !classList.includes('human')) {
                    if (!assistantBlocks.includes(sibling)) {
                      assistantBlocks.push(sibling);
                    }
                  }
                }
              }

              // Also check direct next siblings at the current level
              let nextSibling = current.nextElementSibling;
              let checked = 0;
              while (nextSibling && checked < 10) {
                if (Array.from(userElements).includes(nextSibling)) {
                  break;
                }

                const text = (nextSibling.textContent || '').trim();
                if (text.length > 20 && nextSibling.offsetHeight > 30) {
                  const classList = nextSibling.classList.toString().toLowerCase();
                  if (!classList.includes('user') && !classList.includes('human')) {
                    if (!assistantBlocks.includes(nextSibling)) {
                      assistantBlocks.push(nextSibling);
                    }
                  }
                }
                nextSibling = nextSibling.nextElementSibling;
                checked++;
              }

              current = parent;
              depth++;

              if (assistantBlocks.length > 0) {
                break;
              }
            }

            // Heuristic B: Spatial Search
            // If structural traversal fails, search for content blocks physically positioned
            // between the current user message and the next one.
            if (assistantBlocks.length === 0) {
              const userRect = userEl.getBoundingClientRect();
              let nextUserRect = null;
              const userIndex = Array.from(userElements).indexOf(userEl);
              if (userIndex < userElements.length - 1) {
                const nextUser = userElements[userIndex + 1];
                nextUserRect = nextUser.getBoundingClientRect();
              }

              const candidates = document.querySelectorAll('div[class*="Message"], div[class*="message"], div[class*="Content"], div[class*="content"]');

              Array.from(candidates).forEach((el) => {
                if (Array.from(userElements).includes(el) || el.closest('[data-testid="user-message"]')) {
                  return;
                }

                const elRect = el.getBoundingClientRect();

                // Filter by vertical position
                if (elRect.top <= userRect.bottom) return;
                if (nextUserRect && elRect.top >= nextUserRect.top) return;

                const text = (el.textContent || '').trim();
                if (text.length < 20 || el.offsetHeight < 30) return;

                const classList = el.classList.toString().toLowerCase();
                const hasAssistantClass = classList.includes('assistant') ||
                  classList.includes('claude') ||
                  classList.includes('response') ||
                  classList.includes('ai');

                // Check parent classes for assistant indicators
                let parent = el.parentElement;
                let parentHasAssistantClass = false;
                let depth = 0;
                while (parent && depth < 5) {
                  const parentClass = parent.classList.toString().toLowerCase();
                  if (parentClass.includes('assistant') ||
                    parentClass.includes('claude') ||
                    parentClass.includes('response')) {
                    parentHasAssistantClass = true;
                    break;
                  }
                  parent = parent.parentElement;
                  depth++;
                }

                if (hasAssistantClass || parentHasAssistantClass) {
                  if (!assistantBlocks.includes(el)) {
                    assistantBlocks.push(el);
                  }
                } else {
                  // Last resort: Assume large content blocks in the correct gap are assistant messages
                  // Filter out UI elements and short disclaimers
                  if (elRect.top > userRect.bottom + 50 &&
                    (!nextUserRect || elRect.bottom < nextUserRect.top - 50)) {
                    const tagName = el.tagName.toLowerCase();
                    const isDisclaimer = /^(claude can make mistakes|please double-check|pondering)/i.test(text) && text.length < 100;

                    if (tagName === 'div' &&
                      !el.closest('button, input, form, nav, header, footer') &&
                      !isDisclaimer &&
                      text.length > 30) {
                      if (!assistantBlocks.includes(el)) {
                        assistantBlocks.push(el);
                      }
                    }
                  }
                }
              });
            }

            // Response Aggregation and Cleanup
            if (assistantBlocks.length > 0) {
              // Sort blocks by visual order
              assistantBlocks.sort((a, b) => {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                return rectA.top - rectB.top;
              });

              const disclaimerPatterns = [
                /claude can make mistakes\.?\s*please double-check responses\.?/gi,
                /pondering,?\s*stand by\.\.\./gi,
                /^claude can make mistakes/i,
                /^please double-check/i
              ];

              // Extract text and filter empty blocks
              const blockTexts = assistantBlocks
                .map(block => (block.textContent || block.innerText || '').trim())
                .filter(text => text.length > 0);

              // Remove standard disclaimers
              const cleanedBlockTexts = blockTexts.map(text => {
                let cleaned = text;
                disclaimerPatterns.forEach(pattern => {
                  cleaned = cleaned.replace(pattern, '').trim();
                });
                return cleaned;
              }).filter(text => text.length > 0);

              const blockTextsToUse = cleanedBlockTexts.length > 0 ? cleanedBlockTexts : blockTexts;

              // Deduplicate content (remove substrings and exact matches)
              const uniqueTexts = [];
              const seenContent = new Set();

              for (let i = 0; i < blockTextsToUse.length; i++) {
                const current = blockTextsToUse[i].trim();
                if (!current || current.length === 0) continue;

                const currentNormalized = current.toLowerCase();

                if (seenContent.has(currentNormalized)) continue;

                let isSubstring = false;
                for (const seen of seenContent) {
                  // Skip if current is a substring of an existing block
                  if (currentNormalized.length < seen.length * 0.8 && seen.includes(currentNormalized)) {
                    isSubstring = true;
                    break;
                  }
                  // Replace existing block if it is a substring of current (current is more complete)
                  if (seen.length < currentNormalized.length * 0.8 && currentNormalized.includes(seen)) {
                    const indexToRemove = uniqueTexts.findIndex(t => t.trim().toLowerCase() === seen);
                    if (indexToRemove !== -1) {
                      uniqueTexts.splice(indexToRemove, 1);
                      seenContent.delete(seen);
                    }
                    break;
                  }
                }

                if (!isSubstring) {
                  uniqueTexts.push(current);
                  seenContent.add(currentNormalized);
                }
              }

              // Ensure at least one block is preserved
              if (uniqueTexts.length === 0 && blockTextsToUse.length > 0) {
                const firstBlock = blockTextsToUse.find(b => b && b.trim().length > 0);
                if (firstBlock) {
                  uniqueTexts.push(firstBlock.trim());
                }
              }

              let combinedContent = uniqueTexts
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

              const originalCombined = combinedContent;

              // Sentence-level deduplication for repetitive content
              const sentences = combinedContent.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
              if (sentences.length > 1) {
                const uniqueSentences = [];
                const seenSentences = new Set();

                sentences.forEach(sentence => {
                  const normalized = sentence.trim().toLowerCase().substring(0, 50);
                  if (!seenSentences.has(normalized)) {
                    seenSentences.add(normalized);
                    uniqueSentences.push(sentence.trim());
                  }
                });

                const deduplicated = uniqueSentences.join('. ').trim();
                if (deduplicated.length > 0 && deduplicated.length >= originalCombined.length * 0.5) {
                  combinedContent = deduplicated;
                } else {
                  combinedContent = originalCombined;
                }
              }

              // Final Validation: Filter out pure disclaimers or thinking states
              const isOnlyDisclaimer = disclaimerPatterns.some(pattern => {
                const matches = combinedContent.match(pattern);
                if (!matches) return false;
                const disclaimerLength = matches.reduce((sum, m) => sum + m.length, 0);
                return disclaimerLength >= combinedContent.length * 0.8 && combinedContent.length < 150;
              });

              const thinkingPatterns = [
                /^pondering,?\s*stand by\.\.\./i,
                /^thinking\.\.\./i,
                /^generating\.\.\./i,
                /pondering,?\s*stand by/i,
                /^stand by/i,
                /^searching/i,
                /^web searching/i,
                /^browsing/i,
                /^checking/i,
                /^looking up/i,
                /^running/i,
                /^analyzing/i,
                /^reading/i
              ];

              const isThinkingOnly = thinkingPatterns.some(pattern => {
                const match = combinedContent.match(pattern);
                if (!match) return false;
                return match[0].length >= combinedContent.length * 0.7 || combinedContent.length < 100;
              });

              const endsWithEllipsis = combinedContent.trim().endsWith('...') && combinedContent.length < 200;

              if (combinedContent.length >= 10 && !isOnlyDisclaimer && !isThinkingOnly && !endsWithEllipsis) {
                const contentHash = combinedContent.substring(0, 50).replace(/\s/g, '').substring(0, 20);
                const id = `msg-claude-assistant-${userIndex}-${contentHash}`;

                newMessages.push({
                  id,
                  role: 'assistant',
                  content: combinedContent.substring(0, 200),
                  fullContent: combinedContent,
                  element: assistantBlocks[0], // Anchor to the first block
                  timestamp: Date.now(),
                  order: messageOrder++
                });
              }
            }
          } catch (err) {
            console.error(`Hopper [Claude]: Error finding assistant for user ${userIndex}:`, err);
          }
        });

        return newMessages;
      } catch (error) {
        console.error('Hopper [Claude]: Error detecting messages:', error);
        return [];
      }
    },

    /**
     * Returns the main scrollable container for the chat interface.
     */
    getContainer: function () {
      return document.querySelector('[data-testid="conversation-turn-list"]') ||
        document.querySelector('main') ||
        document.body;
    },

    /**
     * Returns the CSS selector used to identify individual message elements.
     */
    getMessageSelector: function () {
      return '[data-testid="user-message"], [data-testid="chat-user-message-content"], div[class*="Message"], div[class*="message"]';
    },

    /**
     * Returns the debounce time for DOM observation.
     * Claude requires a longer debounce (1000ms) due to its slower streaming and thinking phases.
     */
    getDebounceTime: function () {
      return 1000;
    },

    /**
     * Returns the wait time after initial detection to allow for streaming completion.
     */
    getStreamingWaitTime: function () {
      return 3000;
    },

    /**
     * Checks if the platform is currently in a streaming or "thinking" state.
     * Used to delay message detection until the response is stable.
     *
     * Strategies:
     * 1. Detects visible loading spinners or "thinking" indicators.
     * 2. Analyzes the last message for incomplete content (e.g., trailing ellipsis).
     * 3. Checks for active input generation near the input area.
     *
     * @returns {boolean} True if streaming is detected.
     */
    isStreaming: function () {
      try {
        // Priority 1: Visible Loading Indicators
        const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="thinking"], [aria-label*="thinking"], [aria-label*="generating"]');
        for (const spinner of spinners) {
          const rect = spinner.getBoundingClientRect();
          const style = window.getComputedStyle(spinner);
          if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
            const viewportBottom = window.innerHeight;
            if (rect.top < viewportBottom + 500) {
              return true;
            }
          }
        }

        // Priority 2: Incomplete Content at Bottom of Conversation
        const userMessages = document.querySelectorAll('[data-testid="user-message"]');
        if (userMessages.length > 0) {
          const lastUserMsg = userMessages[userMessages.length - 1];
          const lastUserRect = lastUserMsg.getBoundingClientRect();
          const viewportBottom = window.innerHeight;

          if (lastUserRect.top < viewportBottom + 1000) {
            const allDivs = document.querySelectorAll('div');
            for (const div of allDivs) {
              const divRect = div.getBoundingClientRect();
              if (divRect.top > lastUserRect.bottom &&
                divRect.top < lastUserRect.bottom + 300 &&
                divRect.width > 0 &&
                divRect.height > 0) {
                const text = (div.textContent || '').trim();
                if (text) {
                  if (text.endsWith('...') && text.length < 200) {
                    return true;
                  }
                  if (text.length < 50 && /^(pondering|stand by|thinking|generating)/i.test(text)) {
                    return true;
                  }
                }
              }
            }
          }
        }

        // Priority 3: Active Input Area Generation
        const inputArea = document.querySelector('[data-testid="chat-input"], textarea, input[type="text"]');
        if (inputArea) {
          const inputRect = inputArea.getBoundingClientRect();
          if (inputRect.top < window.innerHeight) {
            const allDivs = document.querySelectorAll('div');
            for (const div of allDivs) {
              const divRect = div.getBoundingClientRect();
              if (divRect.top < inputRect.top && divRect.bottom > inputRect.top - 200) {
                const text = (div.textContent || '').trim();
                if (text && text.length < 100 && /pondering|stand by|thinking|generating/i.test(text)) {
                  return true;
                }
              }
            }
          }
        }

        return false;
      } catch (error) {
        return false;
      }
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
