import { useRef, type MouseEvent, type PointerEvent } from 'react';
import type { SystemMessage, UserMessage } from '../chat/types';
import { formatMessageTime } from '../lib/time';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { MessageText } from './MessageText';

export function SystemLine({ message }: { message: SystemMessage }) {
  const text =
    message.systemType === 'join'
      ? `${message.nickname} 進入了聊天室`
      : message.systemType === 'leave'
        ? `${message.nickname} 離開了聊天室`
        : `${message.nickname} 被管理員請出聊天室`;
  return <div className="sys">{text}</div>;
}

export interface MessageActions {
  onEdit(message: UserMessage): void;
  onRecall(message: UserMessage): void;
  onRemove(message: UserMessage): void;
  onKick(message: UserMessage): void;
  onOpenImage(message: UserMessage): void;
  /** 手機：長按 */
  onMenu(message: UserMessage): void;
}

interface MessageItemProps extends MessageActions {
  message: UserMessage;
  mine: boolean;
  mentionedMe: boolean;
  viewerIsAdmin: boolean;
  editing: boolean;
}

const LONG_PRESS_MS = 480;

function Thumbnail({ message, onOpen }: { message: UserMessage; onOpen: () => void }) {
  const image = message.image;
  if (!image) return null;
  if (!image.url) {
    return (
      <span className="thumb thumb--missing">
        <Icon name="image" size="md" />
        示範模式不保留圖片
      </span>
    );
  }
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={`查看 ${message.nickname} 傳的圖片`}>
      <img
        src={image.url}
        alt=""
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </button>
  );
}

export function MessageItem({
  message,
  mine,
  mentionedMe,
  viewerIsAdmin,
  editing,
  onEdit,
  onRecall,
  onRemove,
  onKick,
  onOpenImage,
  onMenu,
}: MessageItemProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  if (message.status !== 'normal') {
    const text = message.status === 'recalled' ? `${message.nickname} 收回了一則訊息` : '此訊息已被管理員刪除';
    return (
      <div className="msg" id={`msg-${message.id}`} style={mine ? { justifyContent: 'flex-end' } : undefined}>
        {!mine && <Avatar nickname={message.nickname} isAdmin={message.isAdmin} />}
        <div className="gone">{text}</div>
      </div>
    );
  }

  const canEdit = mine;
  const canModerate = viewerIsAdmin && !mine;
  const actionable = canEdit || canModerate;
  const time = formatMessageTime(message.createdAt);
  const hasImage = Boolean(message.image);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };

  const touchHandlers = actionable
    ? {
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType !== 'touch') return;
          pressStart.current = { x: e.clientX, y: e.clientY };
          pressTimer.current = setTimeout(() => {
            pressTimer.current = null;
            onMenu(message);
          }, LONG_PRESS_MS);
        },
        onPointerMove: (e: PointerEvent) => {
          const s = pressStart.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (e: MouseEvent) => {
          // Android 長按會觸發 contextmenu：改成打開我們自己的選單
          if (window.matchMedia('(pointer: coarse)').matches) {
            e.preventDefault();
            cancelPress();
            onMenu(message);
          }
        },
      }
    : {};

  const tools = actionable && (
    <div className="msg__tools" role="toolbar" aria-label={canEdit ? '訊息操作' : '管理員操作'}>
      {canEdit && (
        <>
          <button type="button" className="tool-btn" onClick={() => onEdit(message)}>
            <Icon name="pencil" size="sm" />
            編輯
          </button>
          <button type="button" className="tool-btn" onClick={() => onRecall(message)}>
            <Icon name="recall" size="sm" />
            收回
          </button>
        </>
      )}
      {canModerate && (
        <>
          <button type="button" className="tool-btn tool-btn--danger" onClick={() => onRemove(message)}>
            <Icon name="trash" size="sm" />
            刪除
          </button>
          <button type="button" className="tool-btn tool-btn--danger" onClick={() => onKick(message)}>
            <Icon name="kick" size="sm" />
            踢出此人
          </button>
        </>
      )}
    </div>
  );

  const bubble = (
    <div className={hasImage ? 'bubble bubble--image' : 'bubble'}>
      {hasImage && <Thumbnail message={message} onOpen={() => onOpenImage(message)} />}
      {message.text &&
        (hasImage ? (
          <div className="bubble__text">
            <MessageText text={message.text} mentions={message.mentions} />
          </div>
        ) : (
          <MessageText text={message.text} mentions={message.mentions} />
        ))}
    </div>
  );

  const classes = [
    'msg',
    mine ? 'msg--mine' : '',
    actionable ? 'msg--actionable' : '',
    mentionedMe && !mine ? 'msg--mentioned' : '',
    editing ? 'msg--editing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (mine) {
    return (
      <div className={classes} id={`msg-${message.id}`} {...touchHandlers}>
        {tools}
        {bubble}
        <div className="msg__meta">
          {message.editedAt && (
            <>
              <span>已編輯</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <time dateTime={message.createdAt}>{time}</time>
        </div>
      </div>
    );
  }

  return (
    <div className={classes} id={`msg-${message.id}`} {...touchHandlers}>
      {tools}
      <Avatar nickname={message.nickname} isAdmin={message.isAdmin} />
      <div className="msg__col">
        <div className="msg__meta">
          <span className="msg__name">{message.nickname}</span>
          {message.isAdmin && <span className="badge">管理員</span>}
          <time dateTime={message.createdAt}>{time}</time>
          {message.editedAt && <span>已編輯</span>}
        </div>
        {bubble}
      </div>
    </div>
  );
}
