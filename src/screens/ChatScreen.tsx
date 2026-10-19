import { useEffect, useState, type DragEvent } from 'react';
import type { ChatService } from '../chat/ChatService';
import type { IsoTime, OnlineUser, UserMessage } from '../chat/types';
import { Composer } from '../components/Composer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DemoBanner } from '../components/DemoBanner';
import { ImageViewer } from '../components/ImageViewer';
import { KickDialog } from '../components/KickDialog';
import { MessageList } from '../components/MessageList';
import { MessageMenu } from '../components/MessageMenu';
import { NotifySettings } from '../components/NotifySettings';
import { People, PeopleDrawer } from '../components/OnlineList';
import { ThemeSheet } from '../components/ThemeSheet';
import { Toasts, useToasts } from '../components/Toasts';
import { ConnectionBar, TopBar } from '../components/TopBar';
import { useChatRoom } from './useChatRoom';

interface ChatScreenProps {
  service: ChatService;
  me: OnlineUser;
  background: string;
  onBackgroundChange(color: string): void;
  onLeft(): void;
  onKicked(until: IsoTime | null): void;
  onNicknameLost(nickname: string): void;
}

type Confirm =
  | { kind: 'recall'; message: UserMessage }
  | { kind: 'remove'; message: UserMessage }
  | { kind: 'leave' };

type Sheet = 'people' | 'notify' | 'theme' | null;

function useIsTouch(): boolean {
  const query = '(pointer: coarse)';
  const [touch, setTouch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setTouch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

export function ChatScreen({ service, me, background, onBackgroundChange, onLeft, onKicked, onNicknameLost }: ChatScreenProps) {
  const { toasts, show: toast } = useToasts();
  const room = useChatRoom(service, me, { onKicked, onNicknameLost, toast });
  const isTouch = useIsTouch();
  const viewerIsAdmin = service.isAdmin();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [kickTarget, setKickTarget] = useState<{ userId: string; nickname: string } | null>(null);
  const [menuFor, setMenuFor] = useState<UserMessage | null>(null);
  const [viewing, setViewing] = useState<UserMessage | null>(null);
  const [editing, setEditing] = useState<UserMessage | null>(null);
  const [insertRequest, setInsertRequest] = useState<{ nickname: string; nonce: number } | null>(null);
  const [droppedFile, setDroppedFile] = useState<{ file: File; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const paused = room.status !== 'online';

  // 正在編輯的訊息被收回或刪除了：離開編輯模式
  useEffect(() => {
    if (!editing) return;
    const current = room.messages.find((m) => m.id === editing.id);
    if (!current || current.kind !== 'user' || current.status !== 'normal') setEditing(null);
  }, [room.messages, editing]);

  const pickPerson = (nickname: string) => {
    setSheet(null);
    setInsertRequest({ nickname, nonce: Date.now() });
  };

  const actions = {
    onEdit: (m: UserMessage) => setEditing(m),
    onRecall: (m: UserMessage) => setConfirm({ kind: 'recall', message: m }),
    onRemove: (m: UserMessage) => setConfirm({ kind: 'remove', message: m }),
    onKick: (m: UserMessage) => setKickTarget({ userId: m.authorId, nickname: m.nickname }),
    onOpenImage: (m: UserMessage) => setViewing(m),
    onMenu: (m: UserMessage) => setMenuFor(m),
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setDroppedFile({ file, nonce: Date.now() });
  };

  return (
    <div className="chat">
      {service.mode === 'demo' && <DemoBanner slim />}
      <TopBar
        onlineCount={room.online.length}
        myNickname={me.nickname}
        isAdmin={viewerIsAdmin}
        onPeople={() => setSheet('people')}
        onTheme={() => setSheet('theme')}
        onNotify={() => setSheet('notify')}
        onLeave={() => setConfirm({ kind: 'leave' })}
      />
      <ConnectionBar status={room.status} />

      <div className="chat__body">
        <main
          className="chat__main"
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <MessageList
            messages={room.messages}
            pending={room.pending}
            myId={me.userId}
            myNickname={me.nickname}
            viewerIsAdmin={viewerIsAdmin}
            editingId={editing?.id ?? null}
            loading={room.loading}
            onRetry={room.retry}
            onDiscard={room.discard}
            {...actions}
          />
          {dragging && <div className="drop-overlay">放開就加入這張圖片</div>}
          <Composer
            online={room.online}
            paused={paused}
            cooldown={room.cooldown}
            editing={editing ? { id: editing.id, text: editing.text } : null}
            insertRequest={insertRequest}
            droppedFile={droppedFile}
            isTouch={isTouch}
            devTools={service.devTools}
            onSend={room.send}
            onSaveEdit={async (text) => {
              if (!editing) return;
              if (text === editing.text) {
                setEditing(null);
                return;
              }
              if (await room.edit(editing.id, text)) setEditing(null);
            }}
            onCancelEdit={() => setEditing(null)}
            onToast={toast}
          />
        </main>
        <aside className="chat__aside" aria-label="線上名單">
          <People
            users={room.online}
            viewerIsAdmin={viewerIsAdmin}
            onPick={pickPerson}
            onKick={(u) => setKickTarget({ userId: u.userId, nickname: u.nickname })}
          />
        </aside>
      </div>

      {sheet === 'people' && (
        <PeopleDrawer
          users={room.online}
          viewerIsAdmin={viewerIsAdmin}
          onPick={pickPerson}
          onKick={(u) => {
            setSheet(null);
            setKickTarget({ userId: u.userId, nickname: u.nickname });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'notify' && (
        <NotifySettings
          service={service}
          mode={room.notifyMode}
          myNickname={me.nickname}
          onModeChange={room.setNotifyMode}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'theme' && (
        <ThemeSheet value={background} onChange={onBackgroundChange} onClose={() => setSheet(null)} />
      )}

      {menuFor && (
        <MessageMenu
          message={menuFor}
          mine={menuFor.authorId === me.userId}
          viewerIsAdmin={viewerIsAdmin}
          onEdit={() => actions.onEdit(menuFor)}
          onRecall={() => actions.onRecall(menuFor)}
          onRemove={() => actions.onRemove(menuFor)}
          onKick={() => actions.onKick(menuFor)}
          onClose={() => setMenuFor(null)}
        />
      )}

      {confirm?.kind === 'recall' && (
        <ConfirmDialog
          title="確定要收回這則訊息嗎？"
          confirmLabel="收回"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await room.recall(confirm.message.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm?.kind === 'remove' && (
        <ConfirmDialog
          title="確定要刪除這則訊息嗎？"
          confirmLabel="刪除"
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await room.remove(confirm.message.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm?.kind === 'leave' && (
        <ConfirmDialog
          title="確定要離開聊天室嗎？"
          confirmLabel="離開"
          tone="dark"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await service.leave();
            setConfirm(null);
            onLeft();
          }}
        />
      )}
      {kickTarget && (
        <KickDialog
          nickname={kickTarget.nickname}
          onCancel={() => setKickTarget(null)}
          onConfirm={async (duration) => {
            if (await room.kick(kickTarget.userId, duration)) {
              toast(`已踢出 ${kickTarget.nickname}`);
              setKickTarget(null);
            }
          }}
        />
      )}
      {viewing && <ImageViewer message={viewing} onClose={() => setViewing(null)} />}

      <Toasts toasts={toasts} />
    </div>
  );
}
