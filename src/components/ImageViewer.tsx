import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import type { UserMessage } from '../chat/types';
import { formatMessageTime } from '../lib/time';
import { Icon } from './Icon';

/** 點縮圖 → 全螢幕看原圖。點背景、按 ✕ 或 Esc 關閉；手機可以兩指縮放（7.4） */
export function ImageViewer({ message, onClose }: { message: UserMessage; onClose(): void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        e.preventDefault();
        closeBtn.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchStart.current = { distance: distance(), scale };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const next = (pinchStart.current.scale * distance()) / pinchStart.current.distance;
      setScale(Math.min(4, Math.max(1, next)));
    }
  };
  const onPointerEnd = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    setScale((s) => Math.min(4, Math.max(1, s - e.deltaY * 0.01)));
  };

  if (!message.image?.url) return null;

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${message.nickname} 傳的圖片`}>
      <div className="viewer__top">
        <div className="viewer__who">
          <strong>{message.nickname}</strong>
          <span>{formatMessageTime(message.createdAt)}</span>
        </div>
        <button ref={closeBtn} type="button" className="viewer__close" aria-label="關閉圖片" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div
        className="viewer__stage"
        onClick={(e) => {
          if (e.target === e.currentTarget && pointers.current.size === 0) onClose();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        <img
          src={message.image.url}
          alt={`${message.nickname} 傳的圖片`}
          style={{ transform: `scale(${scale})` }}
          onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}
          draggable={false}
        />
      </div>
      <div className="viewer__hint">
        <Icon name="pinch" size="md" />
        <span>兩指縮放・點背景關閉</span>
      </div>
    </div>,
    document.body,
  );
}
