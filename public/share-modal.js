/**
 * Safe Share Modal Event Handler
 * Fixes: "Uncaught TypeError: Cannot read properties of null (reading 'addEvent') at share-modal.js"
 * Ensures all DOM elements are verified for existence (not null) before attaching event listeners.
 */

(function () {
  'use strict';

  // Safe helper to attach event listeners without throwing null errors
  window.addEvent = function (element, event, handler) {
    if (!element) {
      // Element is null or undefined - gracefully ignore without throwing error
      return false;
    }
    try {
      if (element.addEventListener) {
        element.addEventListener(event, handler, false);
        return true;
      } else if (element.attachEvent) {
        element.attachEvent('on' + event, handler);
        return true;
      } else {
        element['on' + event] = handler;
        return true;
      }
    } catch (err) {
      console.warn('share-modal.js addEvent warning:', err);
      return false;
    }
  };

  // Safe query wrapper that checks element existence before adding event
  window.safeBindEvent = function (selectorOrElement, eventName, handler) {
    var el = null;
    if (typeof selectorOrElement === 'string') {
      el = document.querySelector(selectorOrElement) || document.getElementById(selectorOrElement);
    } else {
      el = selectorOrElement;
    }

    if (el) {
      return window.addEvent(el, eventName, handler);
    }
    return false;
  };

  // Initialize share modal handlers when DOM is ready
  function initShareModal() {
    var shareButtons = document.querySelectorAll('.share-btn, [data-share], #share-button');
    if (shareButtons && shareButtons.length > 0) {
      shareButtons.forEach(function (btn) {
        if (btn) {
          window.addEvent(btn, 'click', function (e) {
            // Safe share action
            if (navigator.share) {
              navigator
                .share({
                  title: document.title,
                  url: window.location.href,
                })
                .catch(function () {});
            }
          });
        }
      });
    }

    var closeModalBtn = document.querySelector('.share-modal-close, #share-modal-close');
    if (closeModalBtn) {
      window.addEvent(closeModalBtn, 'click', function () {
        var modal = document.querySelector('.share-modal, #share-modal');
        if (modal) {
          modal.style.display = 'none';
        }
      });
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initShareModal, 100);
  } else if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', initShareModal);
  }
})();
