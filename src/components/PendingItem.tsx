import type { PreparedImage } from '../chat/types';
import { Icon } from './Icon';
import { MessageText } from './MessageText';

/** 已經按了送出、但通訊層還沒確認的訊息（畫面自己的狀態，不屬於通訊約定） */
export interface PendingMessage {
  localId: string;
  text: string;
  mentions: string[];
  image: PreparedImage | null;
  /** 送出前預覽用的 blob: 網址 */
  previewUrl: string | null;
  state: 'sending' | 'failed';
  error?: string;
}

export function PendingItem({ item, onRetry, onDiscard }: { item: PendingMessage; onRetry(): void; onDiscard(): void }) {
  const failed = item.state === 'failed';
  return (
    <div className={failed ? 'msg msg--mine' : 'msg msg--mine msg--sending'}>
      <div className={item.previewUrl ? 'bubble bubble--image' : 'bubble'}>
        {item.previewUrl && (
          <span className="thumb">
            <img src={item.previewUrl} alt="" width={item.image?.width} height={item.image?.height} />
          </span>
        )}
        {item.text &&
          (item.previewUrl ? (
            <div className="bubble__text">
              <MessageText text={item.text} mentions={item.mentions} />
            </div>
          ) : (
            <MessageText text={item.text} mentions={item.mentions} />
          ))}
      </div>
      {failed ? (
        <div className="msg__failed" role="alert">
          <Icon name="alert" size="sm" />
          <span>傳送失敗{item.error ? `：${item.error}` : ''}</span>
          <button type="button" className="chip-btn" onClick={onRetry}>
            重試
          </button>
          <button type="button" className="chip-btn" onClick={onDiscard} aria-label="不送了，拿掉這則訊息">
            拿掉
          </button>
        </div>
      ) : (
        <div className="msg__meta">傳送中…</div>
      )}
    </div>
  );
}
