import { useId } from 'react';
import type { OnlineUser } from '../chat/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Overlay } from './Overlay';

interface PeopleProps {
  users: OnlineUser[];
  viewerIsAdmin: boolean;
  onPick(nickname: string): void;
  onKick(user: OnlineUser): void;
  onClose?: () => void;
  titleId?: string;
}

/** 線上名單的內容：電腦固定在右側，手機放在側邊滑出的抽屜裡（7.3） */
export function People({ users, viewerIsAdmin, onPick, onKick, onClose, titleId }: PeopleProps) {
  return (
    <>
      <div className="people__head">
        <h2 className="people__title" id={titleId}>
          線上 {users.length} 人
        </h2>
        {onClose && (
          <button type="button" className="icon-btn people__close" aria-label="關閉線上名單" onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <p className="people__hint">點一下名字，就會在輸入框插入 @代號</p>
      <ul className="people__list">
        {users.map((u) => (
          <li key={u.userId} className="person">
            <button
              type="button"
              className="person__btn"
              onClick={() => onPick(u.nickname)}
              aria-label={u.isMe ? `${u.nickname}（你）` : `在輸入框插入 @${u.nickname}`}
              disabled={u.isMe}
              style={u.isMe ? { cursor: 'default' } : undefined}
            >
              <Avatar nickname={u.nickname} isAdmin={u.isAdmin} large />
              <span className="person__name" style={u.isMe || u.isAdmin ? { fontWeight: 700 } : undefined}>
                {u.nickname}
              </span>
              {u.isAdmin && <span className="badge">管理員</span>}
              {u.isMe && <span className="person__me">（你）</span>}
            </button>
            {viewerIsAdmin && !u.isMe && !u.isAdmin && (
              <button type="button" className="kick-btn" onClick={() => onKick(u)}>
                踢出
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PeopleDrawer(props: Omit<PeopleProps, 'titleId'> & { onClose: () => void }) {
  const id = useId();
  return (
    <Overlay onClose={props.onClose} placement="right" panelClassName="drawer" labelledBy={id}>
      <People {...props} titleId={id} />
    </Overlay>
  );
}
