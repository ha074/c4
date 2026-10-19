import { useId, useState } from 'react';
import { Overlay } from './Overlay';

interface ConfirmDialogProps {
  title: string;
  confirmLabel: string;
  tone?: 'accent' | 'danger' | 'dark';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/** 確認收回／確認刪除／確認離開（design.md：置中對話框，左「取消」、右確定） */
export function ConfirmDialog({ title, confirmLabel, tone = 'accent', onConfirm, onCancel }: ConfirmDialogProps) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const toneClass = tone === 'danger' ? 'btn--danger' : tone === 'dark' ? 'btn--dark' : 'btn--primary';
  return (
    <Overlay onClose={onCancel} placement="center" panelClassName="dialog" labelledBy={id} role="alertdialog">
      <p className="dialog__title" id={id}>
        {title}
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--secondary btn--compact" onClick={onCancel} data-autofocus>
          取消
        </button>
        <button
          type="button"
          className={`btn btn--compact ${toneClass}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}
