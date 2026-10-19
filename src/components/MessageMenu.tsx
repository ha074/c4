import type { UserMessage } from '../chat/types';
import { Icon } from './Icon';
import { Overlay } from './Overlay';

interface MessageMenuProps {
  message: UserMessage;
  mine: boolean;
  viewerIsAdmin: boolean;
  onEdit(): void;
  onRecall(): void;
  onRemove(): void;
  onKick(): void;
  onClose(): void;
}

/** 手機長按訊息出現的選單：自己的訊息（編輯、收回）；管理員看別人的訊息（刪除、踢出此人） */
export function MessageMenu({ message, mine, viewerIsAdmin, onEdit, onRecall, onRemove, onKick, onClose }: MessageMenuProps) {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Overlay onClose={onClose} panelClassName="sheet sheet--menu" label="訊息操作">
      <div className="sheet__grip" aria-hidden="true" style={{ marginBottom: 6 }} />
      {!mine && viewerIsAdmin && (
        <div className="menu-context">
          <span className="badge">管理員</span>
          <span>對 {message.nickname} 的訊息</span>
        </div>
      )}
      {mine && (
        <>
          <button type="button" className="menu-item" onClick={run(onEdit)}>
            <Icon name="pencil" />
            編輯
          </button>
          <button type="button" className="menu-item menu-item--danger" onClick={run(onRecall)}>
            <Icon name="recall" />
            收回
          </button>
        </>
      )}
      {!mine && viewerIsAdmin && (
        <>
          <button type="button" className="menu-item menu-item--danger" onClick={run(onRemove)}>
            <Icon name="trash" />
            刪除
          </button>
          <button type="button" className="menu-item menu-item--danger" onClick={run(onKick)}>
            <Icon name="kick" />
            踢出此人
          </button>
        </>
      )}
      <div className="menu-sep" />
      <button type="button" className="menu-item menu-item--cancel" onClick={onClose}>
        取消
      </button>
    </Overlay>
  );
}
