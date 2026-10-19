import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface OverlayProps {
  /** 點背景或按 Esc 時呼叫 */
  onClose: () => void;
  /** bottom：手機從下方滑出（電腦置中）；center：置中對話框；right：從右側滑出 */
  placement?: 'bottom' | 'center' | 'right';
  /** 對話框本體的 class（sheet / dialog / drawer） */
  panelClassName: string;
  labelledBy?: string;
  label?: string;
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 遮罩＋對話框的共用外殼：打開時把焦點移進去、Tab 不會跑出去、關閉時焦點回到原本的位置 */
export function Overlay({
  onClose,
  placement = 'bottom',
  panelClassName,
  labelledBy,
  label,
  role = 'dialog',
  children,
}: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const first = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && root) {
        const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const placementClass = placement === 'center' ? ' overlay--center' : placement === 'right' ? ' overlay--right' : '';

  return createPortal(
    <div
      className={`overlay${placementClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div ref={panel} className={panelClassName} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
