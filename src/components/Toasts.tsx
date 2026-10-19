import { useCallback, useRef, useState } from 'react';

interface Toast {
  id: number;
  text: string;
}

/** 短暫提示：幾秒後自動消失 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string) => {
    const id = next.current++;
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, text }].slice(-3));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800);
  }, []);
  return { toasts, show };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
