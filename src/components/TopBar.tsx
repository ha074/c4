import { Icon } from './Icon';

interface TopBarProps {
  onlineCount: number;
  myNickname: string;
  isAdmin: boolean;
  onPeople(): void;
  onTheme(): void;
  onNotify(): void;
  onLeave(): void;
}

/** 頂部列（7.2）：手機是圖示按鈕；電腦多了「5 人在線」、自己的代號和文字標籤 */
export function TopBar({ onlineCount, myNickname, isAdmin, onPeople, onTheme, onNotify, onLeave }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1 className="topbar__name">匿名聊天室</h1>
        <span className="topbar__count">{onlineCount} 人在線</span>
      </div>
      <div className="topbar__actions">
        <div className="topbar__me">
          <strong>{myNickname}</strong>
          {isAdmin && <span className="badge">管理員</span>}
        </div>
        <button
          type="button"
          className="icon-btn topbar__people"
          aria-label={`線上 ${onlineCount} 人，打開線上名單`}
          onClick={onPeople}
        >
          <Icon name="users" />
          <span>{onlineCount}</span>
        </button>
        <button type="button" className="icon-btn" aria-label="聊天背景顏色" onClick={onTheme}>
          <Icon name="palette" />
          <span className="topbar__label" aria-hidden="true">
            背景
          </span>
        </button>
        <button type="button" className="icon-btn" aria-label="通知設定" onClick={onNotify}>
          <Icon name="bell" />
          <span className="topbar__label" aria-hidden="true">
            通知
          </span>
        </button>
        <button type="button" className="icon-btn icon-btn--muted" onClick={onLeave}>
          <Icon name="logout" className="topbar__label" />
          離開
        </button>
      </div>
    </header>
  );
}

export function ConnectionBar({ status }: { status: 'connecting' | 'online' | 'reconnecting' | 'offline' }) {
  if (status === 'online') return null;
  const text =
    status === 'offline' ? '已離線，網路恢復後會自動重新連線' : status === 'connecting' ? '連線中…' : '連線中斷，正在重新連線…';
  return (
    <div className="conn-bar" role="status">
      <Icon name="refresh" size="sm" className={status === 'offline' ? '' : 'spin'} />
      <span>{text}</span>
    </div>
  );
}
