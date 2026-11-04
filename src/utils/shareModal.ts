/**
 * Safe Share Modal Event Handler
 * Fixes: "Uncaught TypeError: Cannot read properties of null (reading 'addEvent') at share-modal.js"
 */

export function safeAddEvent(
  element: HTMLElement | Element | Window | Document | null | undefined,
  event: string,
  handler: EventListenerOrEventListenerObject
): boolean {
  if (!element) {
    return false;
  }
  try {
    if (element.addEventListener) {
      element.addEventListener(event, handler, false);
      return true;
    } else if ((element as any).attachEvent) {
      (element as any).attachEvent('on' + event, handler);
      return true;
    } else {
      (element as any)['on' + event] = handler;
      return true;
    }
  } catch (err) {
    console.warn('share-modal addEvent warning:', err);
    return false;
  }
}

export function bindShareModalEvents(): void {
  if (typeof document === 'undefined') return;

  const shareButtons = document.querySelectorAll('.share-btn, [data-share], #share-button');
  shareButtons.forEach(btn => {
    if (btn) {
      safeAddEvent(btn, 'click', () => {
        if (navigator.share) {
          navigator
            .share({
              title: document.title,
              url: window.location.href,
            })
            .catch(() => {});
        }
      });
    }
  });

  const closeModalBtn = document.querySelector('.share-modal-close, #share-modal-close');
  if (closeModalBtn) {
    safeAddEvent(closeModalBtn, 'click', () => {
      const modal = document.querySelector('.share-modal, #share-modal') as HTMLElement | null;
      if (modal) {
        modal.style.display = 'none';
      }
    });
  }
}

// Auto-bind on load if in browser environment
if (typeof window !== 'undefined') {
  (window as any).addEvent = safeAddEvent;
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(bindShareModalEvents, 100);
  } else {
    window.addEventListener('DOMContentLoaded', bindShareModalEvents);
  }
}
