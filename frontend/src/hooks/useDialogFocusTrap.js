import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const activeDialogs = [];

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hidden
    && element.getAttribute('aria-hidden') !== 'true'
    && !element.classList.contains('hidden')
  ));
}

export default function useDialogFocusTrap(dialogRef, isActive, onClose) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isActive || !dialogRef.current) return undefined;

    const dialog = dialogRef.current;
    const activeDialog = { dialog };
    const previouslyFocused = document.activeElement;
    const initialFocus = dialog.querySelector('[data-dialog-initial-focus]')
      || getFocusableElements(dialog)[0]
      || dialog;

    activeDialogs.push(activeDialog);
    initialFocus.focus();

    const handleKeyDown = (event) => {
      if (activeDialogs[activeDialogs.length - 1] !== activeDialog) return;

      if (event.key === 'Escape' && typeof onCloseRef.current === 'function') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const wasTopmost = activeDialogs[activeDialogs.length - 1] === activeDialog;
      const activeDialogIndex = activeDialogs.lastIndexOf(activeDialog);
      if (activeDialogIndex !== -1) activeDialogs.splice(activeDialogIndex, 1);

      if (wasTopmost && previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef, isActive]);
}
