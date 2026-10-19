import type { ChatMessage, Id, IsoTime } from '../types';

/** 示範版：同一個瀏覽器的分頁之間，透過 BroadcastChannel 互傳的封包 */
export type Packet =
  /** 「誰在線上？」——在線的分頁收到後會馬上回一個心跳 */
  | { t: 'ping' }
  /** 心跳：我還在，代號是什麼 */
  | { t: 'hb'; userId: Id; nickname: string; isAdmin: boolean; bot?: boolean }
  /** 按了「離開」：馬上從名單拿掉（離開的人自己會寫系統訊息） */
  | { t: 'leave'; userId: Id }
  /** 新訊息；圖片直接用 Blob 傳給其他分頁 */
  | { t: 'msg'; message: ChatMessage; blob?: Blob }
  /** 訊息被修改、收回或刪除 */
  | { t: 'upd'; message: ChatMessage }
  /** 某人被管理員踢出 */
  | { t: 'kick'; userId: Id; until: IsoTime | null };

export const CHANNEL_NAME = 'c4-demo-chat';

/** localStorage（所有分頁共用）和 sessionStorage（每個分頁各自一份）用到的鍵 */
export const DEMO_KEYS = {
  messages: 'c4-demo:messages',
  bans: 'c4-demo:bans',
  notifyMode: 'c4-demo:notify-mode',
  userId: 'c4-demo:user-id',
  admin: 'c4-demo:admin',
  session: 'c4-demo:session',
} as const;

export interface DemoSession {
  key: string;
  lastSeen: number;
}

export type BanTable = Record<Id, { until: IsoTime | null }>;
