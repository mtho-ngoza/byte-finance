'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FloatingMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'right' | 'left';
}

/**
 * A menu that renders via a portal so it's never clipped by overflow:hidden parents.
 * The menu floats at the correct position relative to the trigger button.
 */
export function FloatingMenu({ trigger, children, align = 'right' }: FloatingMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: align === 'right' ? rect.right : rect.left,
    });
  };

  const handleOpen = () => {
    updatePosition();
    setOpen(true);
  };

  // Close on scroll or resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen}>
        {trigger}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          {/* Menu */}
          <div
            className="fixed z-[101] bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{
              top: pos.top,
              ...(align === 'right'
                ? { right: window.innerWidth - pos.left }
                : { left: pos.left }),
            }}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
