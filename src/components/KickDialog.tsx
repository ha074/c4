import { useId, useState } from 'react';
import type { KickDuration } from '../chat/types';
import { Overlay } from './Overlay';

const DURATIONS: { value: Exclude<KickDuration, 'forever'>; label: string }[] = [
  { value: '1h', label: '1 小時' },
  { value: '24h', label: '24 小時' },
  { value: '7d', label: '7 天' },
];

interface KickDialogProps {
  nickname: string;
  onConfirm: (duration: KickDuration) => Promise<void>;
  onCancel: () => void;
}

/** 踢出：暫時（1 小時／24 小時／7 天）或永久（design.md 6.2） */
export function KickDialog({ nickname, onConfirm, onCancel }: KickDialogProps) {
  const id = useId();
  const [kind, setKind] = useState<'temporary' | 'forever'>('temporary');
  const [duration, setDuration] = useState<Exclude<KickDuration, 'forever'>>('1h');
  const [busy, setBusy] = useState(false);

  return (
    <Overlay onClose={onCancel} placement="center" panelClassName="dialog" labelledBy={id}>
      <p className="dialog__title" id={id}>
        踢出 {nickname}
      </p>
      <fieldset className="choices">
        <legend className="sr-only">踢出方式</legend>
        <div className="choice" style={{ flexDirection: 'column', gap: 12, cursor: 'default' }}>
          <label style={{ display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`${id}-kind`}
              checked={kind === 'temporary'}
              onChange={() => setKind('temporary')}
              data-autofocus
            />
            <span className="choice__text">
              <strong>暫時踢出</strong>
              <span>時間到了就可以再進來</span>
            </span>
          </label>
          {kind === 'temporary' && (
            <div className="segments" role="radiogroup" aria-label="踢出多久">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={duration === d.value}
                  className="segment"
                  onClick={() => setDuration(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="choice">
          <input type="radio" name={`${id}-kind`} checked={kind === 'forever'} onChange={() => setKind('forever')} />
          <span className="choice__text">
            <strong style={{ color: 'var(--danger)' }}>永久踢出</strong>
            <span>再也不能用這個瀏覽器進來</span>
          </span>
        </label>
      </fieldset>
      <div className="dialog__actions">
        <button type="button" className="btn btn--secondary btn--compact" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn btn--danger btn--compact"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(kind === 'forever' ? 'forever' : duration);
            } finally {
              setBusy(false);
            }
          }}
        >
          {kind === 'forever' ? '永久踢出' : '踢出'}
        </button>
      </div>
    </Overlay>
  );
}
