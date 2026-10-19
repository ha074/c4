import { RULES } from '../chat/rules';
import type { ChatMessage, NotifyMode } from '../chat/types';

/**
 * 「要不要通知」的規則（架構文件 6.6）：
 * - off：不通知；mentions：只有 @ 到我；all：每則都通知
 * - 自己送的訊息永遠不通知自己
 * - 系統訊息、被收回／刪除的訊息不通知
 */
export function shouldNotify(
  message: ChatMessage,
  mode: NotifyMode,
  me: { userId: string; nickname: string },
): boolean {
  if (mode === 'off') return false;
  if (message.kind !== 'user' || message.status !== 'normal') return false;
  if (message.authorId === me.userId) return false;
  if (mode === 'all') return true;
  return message.mentions.includes(me.nickname);
}

export type NotificationSupport = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** iPhone／iPad 上，網頁沒有「加到主畫面」就不能用通知 */
export function needsHomeScreenOnIos(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationSupport();
  }
}

let lastShownAt = 0;

/** 分頁在背景時跳出瀏覽器通知。「全部訊息」模式下 30 秒內的通知合併成同一則。 */
export function showMessageNotification(message: ChatMessage, mode: NotifyMode): void {
  if (message.kind !== 'user' || notificationSupport() !== 'granted') return;
  const now = Date.now();
  const merge = mode === 'all' && now - lastShownAt < RULES.notifyMergeMs;
  const body = message.text || (message.image ? '傳了一張圖片' : '');
  try {
    const n = new Notification(`${message.nickname}`, {
      body,
      tag: 'c4-chat',
      // 合併期間只更新內容、不再響一次
      silent: merge,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      data: { messageId: message.id },
    });
    n.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent('c4:focus-message', { detail: message.id }));
      n.close();
    };
    if (!merge) lastShownAt = now;
  } catch {
    /* Android Chrome 不允許在網頁裡直接 new Notification，要等階段二的 Service Worker */
  }
}
