import { useId, useState } from 'react';
import type { ChatService } from '../chat/ChatService';
import type { NotifyMode } from '../chat/types';
import {
  needsHomeScreenOnIos,
  notificationSupport,
  requestNotificationPermission,
  type NotificationSupport,
} from '../lib/notify';
import { Icon } from './Icon';
import { Overlay } from './Overlay';

const MODES: { value: NotifyMode; title: string; describe(nick: string): string }[] = [
  { value: 'all', title: '全部訊息', describe: () => '每則新訊息都通知' },
  { value: 'mentions', title: '只有 @ 我（預設）', describe: (nick) => `有人 @${nick} 時才通知` },
  { value: 'off', title: '關閉', describe: () => '完全不通知' },
];

interface NotifySettingsProps {
  service: ChatService;
  mode: NotifyMode;
  myNickname: string;
  onModeChange(mode: NotifyMode): void;
  onClose(): void;
}

/** 通知設定（7.5） */
export function NotifySettings({ service, mode, myNickname, onModeChange, onClose }: NotifySettingsProps) {
  const id = useId();
  const [permission, setPermission] = useState<NotificationSupport>(notificationSupport);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const iosNeedsHome = needsHomeScreenOnIos();

  async function enable() {
    setBusy(true);
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      const push = await service.enablePush();
      if (push.ok) setPushNote('網頁關掉後也收得到通知。');
      else if (push.code === 'unsupported')
        setPushNote(
          service.mode === 'demo'
            ? '分頁在背景時會跳通知。網頁關掉後的推播：示範模式不支援。'
            : '分頁在背景時會跳通知。網頁關掉後的推播還在準備中。',
        );
      else if (push.code === 'permission_denied') setPermission('denied');
    }
    setBusy(false);
  }

  return (
    <Overlay onClose={onClose} panelClassName="sheet sheet--tinted" labelledBy={id}>
      <div className="sheet__grip" aria-hidden="true" />
      <div className="sheet__head">
        <h2 className="sheet__title" id={id}>
          通知設定
        </h2>
        <button type="button" className="icon-btn" style={{ marginRight: -10 }} aria-label="關閉" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <fieldset className="choices">
        <legend>什麼時候提醒我</legend>
        {MODES.map((m) => (
          <label key={m.value} className="choice">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === m.value}
              onChange={() => onModeChange(m.value)}
              data-autofocus={mode === m.value ? true : undefined}
            />
            <span className="choice__text">
              <strong>{m.title}</strong>
              <span>{m.describe(myNickname)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <hr className="divider" />

      {permission === 'denied' ? (
        <section className="help-card help-card--danger" aria-labelledby={`${id}-denied`}>
          <h3 id={`${id}-denied`}>
            <Icon name="ban" size="md" />
            通知被瀏覽器封鎖了
          </h3>
          <p>之前按了「封鎖」，要到瀏覽器設定裡重新打開：</p>
          <ol>
            <li>
              <span className="step-num">1</span>
              <span>
                點網址列左邊的 <strong>鎖頭</strong> 圖示
              </span>
            </li>
            <li>
              <span className="step-num">2</span>
              <span>
                找到「通知」，改成 <strong>允許</strong>
              </span>
            </li>
            <li>
              <span className="step-num">3</span>
              <span>重新整理這個頁面</span>
            </li>
          </ol>
        </section>
      ) : iosNeedsHome ? (
        <section className="help-card" aria-labelledby={`${id}-ios`}>
          <h3 id={`${id}-ios`}>
            <Icon name="phone" size="md" />
            iPhone 要先加到主畫面
          </h3>
          <ol>
            <li>
              <span className="step-tile">
                <Icon name="share" />
              </span>
              <span>
                點 Safari 下方的 <strong>分享</strong>
              </span>
            </li>
            <li>
              <span className="step-tile">
                <Icon name="plusSquare" />
              </span>
              <span>
                選 <strong>加入主畫面</strong>
              </span>
            </li>
            <li>
              <span className="step-tile step-tile--accent">
                <Icon name="chat" />
              </span>
              <span>從主畫面的圖示打開，再回到這裡按「啟用」</span>
            </li>
          </ol>
        </section>
      ) : permission === 'unsupported' ? (
        <p className="note">這個瀏覽器不支援通知。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {permission === 'granted' && pushNote ? (
            <button type="button" className="btn btn--ok" disabled>
              <Icon name="check" />
              已啟用
            </button>
          ) : (
            <button type="button" className="btn btn--primary" style={{ fontSize: 16 }} onClick={enable} disabled={busy}>
              <Icon name="bell" />
              在這台裝置啟用通知
            </button>
          )}
          <p className="note" aria-live="polite">
            {pushNote ?? (permission === 'granted' ? '按一下確認這台裝置的通知設定。' : '按下後，瀏覽器會問你「允許通知嗎？」')}
          </p>
        </div>
      )}
    </Overlay>
  );
}
