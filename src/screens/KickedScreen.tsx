import type { IsoTime } from '../chat/types';
import { Icon } from '../components/Icon';
import { formatRemaining, formatUntil } from '../lib/time';

/** 被踢出畫面：暫時（顯示可以再進來的時間）或永久（7.6、design.md 6.2） */
export function KickedScreen({ until, onBack }: { until: IsoTime | null; onBack(): void }) {
  const forever = until === null;
  return (
    <div className="screen">
      <div className="screen__body kicked">
        <div className={forever ? 'kicked__mark kicked__mark--forever' : 'kicked__mark'} aria-hidden="true">
          <Icon name={forever ? 'ban' : 'logout'} />
        </div>
        <h1 className="screen__title screen__title--sm" style={{ fontSize: 24 }}>
          {forever ? '你已被永久請出聊天室' : '你已被請出聊天室'}
        </h1>
        {forever ? (
          <p className="screen__lead" style={{ fontSize: 15 }}>
            管理員已經禁止你再進入這個聊天室。
          </p>
        ) : (
          <>
            <div className="kicked__card">
              <small>可以再進來的時間</small>
              <strong>{formatUntil(until)}</strong>
              <small>{formatRemaining(until)}</small>
            </div>
            <button type="button" className="text-link" onClick={onBack}>
              回到進入畫面
            </button>
          </>
        )}
      </div>
    </div>
  );
}
