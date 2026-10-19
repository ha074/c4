import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage, UserMessage } from '../chat/types';
import { dayKey, formatDateSeparator } from '../lib/time';
import { Icon } from './Icon';
import { MessageItem, SystemLine, type MessageActions } from './MessageItem';
import { PendingItem, type PendingMessage } from './PendingItem';

interface MessageListProps extends MessageActions {
  messages: ChatMessage[];
  pending: PendingMessage[];
  myId: string;
  myNickname: string;
  viewerIsAdmin: boolean;
  editingId: string | null;
  loading: boolean;
  onRetry(localId: string): void;
  onDiscard(localId: string): void;
}

const BOTTOM_SLACK = 48;

/**
 * 訊息列表：
 * - 本來就在最底下時，新訊息進來會自動捲到最新
 * - 往上捲在看舊訊息時，不會被拉回底部，改成出現「有新訊息 ↓」
 */
export function MessageList(props: MessageListProps) {
  const { messages, pending, myId, myNickname, viewerIsAdmin, editingId, loading, onRetry, onDiscard, ...actions } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastCount = useRef(0);
  const [hasNew, setHasNew] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setHasNew(false);
  }, []);

  const total = messages.length + pending.length;
  const last = pending.length > 0 ? null : messages[messages.length - 1];
  const lastIsMine = pending.length > 0 || (last?.kind === 'user' && last.authorId === myId);

  useLayoutEffect(() => {
    const grew = total > lastCount.current;
    const first = lastCount.current === 0;
    lastCount.current = total;
    if (!grew) return;
    if (first || atBottom.current || lastIsMine) scrollToBottom();
    else setHasNew(true);
  }, [total, lastIsMine, scrollToBottom]);

  // 手機鍵盤跳出來、版面變矮時，保持在最底下
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 點系統通知時，捲到那則訊息
  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center' });
    };
    window.addEventListener('c4:focus-message', onFocus);
    return () => window.removeEventListener('c4:focus-message', onFocus);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    if (atBottom.current) setHasNew(false);
  };

  let previousDay = '';
  return (
    <>
      <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="聊天訊息">
        <div className="messages__spacer" />
        {!loading && messages.length === 0 && pending.length === 0 && (
          <p className="messages__empty">還沒有人說話。打聲招呼，或打 @ 叫線上的人。</p>
        )}
        {messages.map((m) => {
          const day = dayKey(m.createdAt);
          const separator = day !== previousDay ? formatDateSeparator(m.createdAt) : null;
          previousDay = day;
          return (
            <Fragment key={m.id}>
              {separator && (
                <div className="date-sep" role="separator">
                  {separator}
                </div>
              )}
              {m.kind === 'system' ? (
                <SystemLine message={m} />
              ) : (
                <MessageItem
                  message={m as UserMessage}
                  mine={m.authorId === myId}
                  mentionedMe={m.mentions.includes(myNickname)}
                  viewerIsAdmin={viewerIsAdmin}
                  editing={editingId === m.id}
                  {...actions}
                />
              )}
            </Fragment>
          );
        })}
        {pending.map((p) => (
          <PendingItem key={p.localId} item={p} onRetry={() => onRetry(p.localId)} onDiscard={() => onDiscard(p.localId)} />
        ))}
      </div>
      {hasNew && (
        <button type="button" className="new-pill" onClick={() => scrollToBottom(true)}>
          有新訊息
          <Icon name="arrowDown" size="sm" />
        </button>
      )}
    </>
  );
}
