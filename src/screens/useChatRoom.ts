import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatService } from '../chat/ChatService';
import { RULES } from '../chat/rules';
import type { ChatMessage, ConnectionStatus, IsoTime, KickDuration, NotifyMode, OnlineUser } from '../chat/types';
import type { ComposerSend } from '../components/Composer';
import type { PendingMessage } from '../components/PendingItem';
import { errorText } from '../lib/errorText';
import { shouldNotify, showMessageNotification } from '../lib/notify';

interface Callbacks {
  onKicked(until: IsoTime | null): void;
  onNicknameLost(nickname: string): void;
  toast(text: string): void;
}

const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt);

/**
 * 聊天室畫面的狀態：訊息、線上名單、連線狀態、傳送中的訊息。
 * 只透過 ChatService（通訊約定）跟通訊層溝通。
 */
export function useChatRoom(service: ChatService, me: OnlineUser, callbacks: Callbacks) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>(() => service.getOnlineUsers());
  const [status, setStatus] = useState<ConnectionStatus>(service.getConnectionStatus());
  const [notifyMode, setNotifyModeState] = useState<NotifyMode>(service.getNotifyMode());
  const [loading, setLoading] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const sentAt = useRef<number[]>([]);
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const modeRef = useRef(notifyMode);
  modeRef.current = notifyMode;

  const upsert = useCallback((message: ChatMessage) => {
    setMessages((list) => {
      const i = list.findIndex((m) => m.id === message.id);
      if (i === -1) return [...list, message].sort(byTime);
      const next = list.slice();
      next[i] = message;
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const offs = [
      service.on('message:new', (m) => {
        upsert(m);
        if (document.hidden && shouldNotify(m, modeRef.current, me)) showMessageNotification(m, modeRef.current);
      }),
      service.on('message:updated', upsert),
      service.on('presence:sync', setOnline),
      service.on('connection:status', setStatus),
      service.on('me:kicked', ({ until }) => cb.current.onKicked(until)),
      service.on('me:nickname_lost', ({ nickname }) => cb.current.onNicknameLost(nickname)),
    ];
    service.loadRecent(RULES.historyLimit).then((recent) => {
      if (!alive) return;
      // 先到的即時訊息和讀出來的歷史訊息合併，用 ID 去掉重複
      setMessages((live) => {
        const map = new Map<string, ChatMessage>();
        for (const m of recent) map.set(m.id, m);
        for (const m of live) map.set(m.id, m);
        return [...map.values()].sort(byTime);
      });
      setLoading(false);
    });
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [service, me, upsert]);

  // 洗版限制倒數結束後，送出按鈕恢復
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setTimeout(() => setCooldownUntil(0), cooldownUntil - Date.now());
    return () => clearTimeout(t);
  }, [cooldownUntil]);

  const deliver = useCallback(
    async (item: PendingMessage) => {
      const result = await service.sendMessage({ text: item.text, image: item.image, mentions: item.mentions });
      if (result.ok) {
        setPending((list) => list.filter((p) => p.localId !== item.localId));
        upsert(result.value);
        if (item.previewUrl) setTimeout(() => URL.revokeObjectURL(item.previewUrl!), 2_000);
        return;
      }
      const message = errorText(result.code, result.until);
      setPending((list) =>
        list.map((p) => (p.localId === item.localId ? { ...p, state: 'failed', error: message } : p)),
      );
      if (result.code === 'rate_limited') setCooldownUntil(Date.now() + RULES.rateWindowMs / 2);
      cb.current.toast(message);
    },
    [service, upsert],
  );

  const send = useCallback(
    (input: ComposerSend) => {
      // 前端先擋一次洗版（真正的防線在通訊層／資料庫）
      const now = Date.now();
      sentAt.current = sentAt.current.filter((t) => now - t < RULES.rateWindowMs);
      if (sentAt.current.length >= RULES.rateMaxMessages) {
        setCooldownUntil(sentAt.current[0] + RULES.rateWindowMs);
        cb.current.toast(errorText('rate_limited'));
        return false;
      }
      sentAt.current.push(now);
      const item: PendingMessage = {
        localId: `local-${now}-${Math.random().toString(36).slice(2)}`,
        text: input.text,
        mentions: input.mentions,
        image: input.image,
        previewUrl: input.previewUrl,
        state: 'sending',
      };
      setPending((list) => [...list, item]);
      void deliver(item);
      return true;
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = pending.find((p) => p.localId === localId);
      if (!item) return;
      const again = { ...item, state: 'sending' as const, error: undefined };
      setPending((list) => list.map((p) => (p.localId === localId ? again : p)));
      void deliver(again);
    },
    [pending, deliver],
  );

  const discard = useCallback((localId: string) => {
    setPending((list) => {
      const item = list.find((p) => p.localId === localId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((p) => p.localId !== localId);
    });
  }, []);

  const report = useCallback(<T,>(result: { ok: true; value: T } | { ok: false; code: Parameters<typeof errorText>[0]; until?: string | null }) => {
    if (!result.ok) cb.current.toast(errorText(result.code, result.until));
    return result.ok;
  }, []);

  const edit = useCallback(async (id: string, text: string) => report(await service.editMessage(id, text)), [service, report]);
  const recall = useCallback(async (id: string) => report(await service.recallMessage(id)), [service, report]);
  const remove = useCallback(async (id: string) => report(await service.adminRemoveMessage(id)), [service, report]);
  const kick = useCallback(
    async (userId: string, duration: KickDuration) => report(await service.adminKick(userId, duration)),
    [service, report],
  );

  const setNotifyMode = useCallback(
    (mode: NotifyMode) => {
      setNotifyModeState(mode);
      void service.setNotifyMode(mode);
    },
    [service],
  );

  return {
    messages,
    pending,
    online,
    status,
    loading,
    cooldown: cooldownUntil > Date.now(),
    notifyMode,
    setNotifyMode,
    send,
    retry,
    discard,
    edit,
    recall,
    remove,
    kick,
  };
}
