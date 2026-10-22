/**
 * 資料庫的資料 → 通訊約定的格式（架構文件 5.3）。
 * 資料庫函式和廣播送來的是 camelCase JSON（chat_private.message_json），
 * 直接查 messages 表拿到的是 snake_case 的列，兩種都在這裡轉。
 */
import type { ChatMessage, IsoTime } from '../types';

/** chat_private.message_json() 的格式 */
export interface MessageJson {
  id: string;
  kind: 'user' | 'system';
  createdAt: string;
  authorId: string | null;
  nickname: string;
  isAdmin: boolean;
  text: string;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  mentions: string[] | null;
  editedAt: string | null;
  status: 'normal' | 'recalled' | 'removed';
  systemType: 'join' | 'leave' | 'kicked' | null;
}

/** public.messages 的一列 */
export interface MessageRow {
  id: string;
  kind: 'user' | 'system';
  created_at: string;
  author_id: string | null;
  nickname: string;
  is_admin: boolean;
  text: string;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  mentions: string[] | null;
  edited_at: string | null;
  status: 'normal' | 'recalled' | 'removed';
  system_type: 'join' | 'leave' | 'kicked' | null;
}

export function rowToJson(row: MessageRow): MessageJson {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    authorId: row.author_id,
    nickname: row.nickname,
    isAdmin: row.is_admin,
    text: row.text,
    imagePath: row.image_path,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    mentions: row.mentions,
    editedAt: row.edited_at,
    status: row.status,
    systemType: row.system_type,
  };
}

/** 資料庫的時間（2026-10-13 08:30:00.123+00 之類）統一成 ISO 8601 的 …Z，排序用字串比較才不會亂 */
export function toIso(value: string): IsoTime {
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : new Date(t).toISOString();
}

/** imagePath → 公開網址，由呼叫的人提供（正式版用 Storage 的 getPublicUrl） */
export type ImageUrl = (path: string) => string;

export function toChatMessage(m: MessageJson, imageUrl: ImageUrl): ChatMessage {
  if (m.kind === 'system') {
    return {
      id: m.id,
      kind: 'system',
      createdAt: toIso(m.createdAt),
      systemType: m.systemType ?? 'join',
      nickname: m.nickname,
    };
  }
  const gone = m.status !== 'normal';
  return {
    id: m.id,
    kind: 'user',
    createdAt: toIso(m.createdAt),
    authorId: m.authorId ?? '',
    nickname: m.nickname,
    isAdmin: Boolean(m.isAdmin),
    // 收回或刪除的訊息：內容一定是空的（架構文件 5.3）
    text: gone ? '' : m.text ?? '',
    image:
      !gone && m.imagePath
        ? { url: imageUrl(m.imagePath), width: m.imageWidth ?? 1, height: m.imageHeight ?? 1 }
        : null,
    mentions: gone ? [] : m.mentions ?? [],
    editedAt: m.editedAt ? toIso(m.editedAt) : null,
    status: m.status,
  };
}

/** 圖片的副檔名，用來組 Storage 裡的檔名 */
export function imageExtension(mime: string): string {
  switch (mime) {
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

/** Supabase 專案網址只要 https://xxxx.supabase.co 本身；從後台複製到的 /rest/v1/ 之類的尾巴去掉 */
export function normalizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+(rest|auth|storage|realtime)\/v1\/?.*$/i, '')
    .replace(/\/+$/, '');
}
