/**
 * 通訊約定的資料格式和事件（架構文件第 5 節）。
 * 畫面層和通訊層都只認這個檔案；示範版和正式版都必須照這裡的形狀回傳資料。
 */

/** ISO 8601 時間字串，例如 2026-10-13T08:30:00Z */
export type IsoTime = string;
/** UUID */
export type Id = string;

export interface ChatImage {
  /** 圖片網址。空字串代表「這張圖片已經拿不到」（示範模式重新整理後就會這樣）。 */
  url: string;
  width: number;
  height: number;
}

export type MessageStatus = 'normal' | 'recalled' | 'removed';

export interface UserMessage {
  id: Id;
  kind: 'user';
  createdAt: IsoTime;
  authorId: Id;
  nickname: string;
  isAdmin: boolean;
  text: string;
  image: ChatImage | null;
  mentions: string[];
  editedAt: IsoTime | null;
  status: MessageStatus;
}

export type SystemType = 'join' | 'leave' | 'kicked';

export interface SystemMessage {
  id: Id;
  kind: 'system';
  createdAt: IsoTime;
  systemType: SystemType;
  nickname: string;
}

export type ChatMessage = UserMessage | SystemMessage;

export interface OnlineUser {
  userId: Id;
  nickname: string;
  isAdmin: boolean;
  isMe: boolean;
}

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export type NotifyMode = 'all' | 'mentions' | 'off';

/**
 * 踢出時間。`forever` 是設計時新增的「永久踢出」（docs/design.md 6.2），
 * 架構文件第 5 節原本只有三種時間。
 */
export type KickDuration = '1h' | '24h' | '7d' | 'forever';

/** 送訊息前已經在瀏覽器裡壓縮好的圖片 */
export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface SendInput {
  text: string;
  image: PreparedImage | null;
  mentions: string[];
}

/** 通訊層主動告訴畫面的事（5.2） */
export interface ChatEvents {
  'message:new': ChatMessage;
  'message:updated': ChatMessage;
  'presence:sync': OnlineUser[];
  'connection:status': ConnectionStatus;
  /** until：到什麼時候解除；null 代表永久 */
  'me:kicked': { until: IsoTime | null };
  'me:nickname_lost': { nickname: string };
}

export type ChatEventName = keyof ChatEvents;

/* ---------- 錯誤代碼（5.1） ---------- */

export type NetworkError = 'network';
export type JoinError = 'nickname_taken' | 'nickname_invalid' | 'banned' | NetworkError;
export type SendError =
  | 'rate_limited'
  | 'too_long'
  | 'image_too_large'
  | 'image_type_not_allowed'
  | 'banned'
  | NetworkError;
export type EditError = 'not_owner' | 'too_long' | 'message_gone' | NetworkError;
export type RecallError = 'not_owner' | 'message_gone' | NetworkError;
export type AdminLoginError = 'wrong_credentials' | 'not_admin' | NetworkError;
export type AdminError = 'not_admin' | 'message_gone' | NetworkError;
export type PushError = 'permission_denied' | 'unsupported' | NetworkError;

export type ErrorCode =
  | JoinError
  | SendError
  | EditError
  | RecallError
  | AdminLoginError
  | AdminError
  | PushError;

export type Ok<T> = { ok: true; value: T };
export type Fail<E extends string> = {
  ok: false;
  code: E;
  /** 只有 banned 會帶：到什麼時候解除，null 代表永久 */
  until?: IsoTime | null;
};
export type Result<T, E extends string> = Ok<T> | Fail<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const fail = <E extends string>(code: E, until?: IsoTime | null): Fail<E> =>
  until === undefined ? { ok: false, code } : { ok: false, code, until };
