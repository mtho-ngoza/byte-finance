'use client';

import { useEffect, useCallback, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Modal content */
  children: ReactNode;
  /** Footer content (typically buttons) */
  footer?: ReactNode;
  /** Max width class (default: 'sm:max-w-md') */
  maxWidth?: string;
  /** Whether to show the close button in header */
  showCloseButton?: boolean;
  /** Whether clicking overlay closes modal */
  closeOnOverlayClick?: boolean;
  /** Whether pressing Escape closes modal */
  closeOnEscape?: boolean;
}

// ---------------------------------------------------------------------------
// Modal Component
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'sm:max-w-md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: ModalProps) {
  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`bg-surface border border-border rounded-t-xl sm:rounded-xl w-full ${maxWidth} flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div>
              {title && <h3 className="text-base font-semibold text-text-primary">{title}</h3>}
              {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-border shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalActions - Common button layout for modal footers
// ---------------------------------------------------------------------------

export interface ModalActionsProps {
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  danger?: boolean;
}

export function ModalActions({
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  confirmDisabled = false,
  confirmLoading = false,
  danger = false,
}: ModalActionsProps) {
  return (
    <div className="flex gap-2">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium hover:bg-background transition-colors"
        >
          {cancelLabel}
        </button>
      )}
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled || confirmLoading}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 transition-colors ${
            danger
              ? 'bg-error text-white hover:bg-error/90'
              : 'bg-primary text-background hover:bg-primary/90'
          }`}
        >
          {confirmLoading ? 'Loading...' : confirmLabel}
        </button>
      )}
    </div>
  );
}
