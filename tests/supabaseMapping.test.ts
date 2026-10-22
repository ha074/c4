import { describe, expect, it } from 'vitest';
import {
  imageExtension,
  normalizeSupabaseUrl,
  rowToJson,
  toChatMessage,
  toIso,
  type MessageJson,
  type MessageRow,
} from '../src/chat/supabase/mapping';

const url = (path: string) => `https://x.supabase.co/storage/v1/object/public/chat-images/${path}`;

const base: MessageJson = {
  id: 'm1',
  kind: 'user',
  createdAt: '2026-10-13T08:30:00.123456+00:00',
  authorId: 'u1',
  nickname: '小明',
  isAdmin: false,
  text: '看這張 @阿華',
  imagePath: 'u1/a.webp',
  imageWidth: 1600,
  imageHeight: 800,
  mentions: ['阿華'],
  editedAt: null,
  status: 'normal',
  systemType: null,
};

describe('normalizeSupabaseUrl', () => {
  it('去掉從後台複製到的 /rest/v1/ 和結尾斜線', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co');
  });
});

describe('toChatMessage（架構文件 5.3 的格式）', () => {
  it('一般訊息：時間變成 ISO、圖片變成公開網址', () => {
    expect(toChatMessage(base, url)).toEqual({
      id: 'm1',
      kind: 'user',
      createdAt: '2026-10-13T08:30:00.123Z',
      authorId: 'u1',
      nickname: '小明',
      isAdmin: false,
      text: '看這張 @阿華',
      image: { url: url('u1/a.webp'), width: 1600, height: 800 },
      mentions: ['阿華'],
      editedAt: null,
      status: 'normal',
    });
  });

  it('收回或刪除的訊息：內容一定是空的', () => {
    const recalled = toChatMessage({ ...base, status: 'recalled' }, url);
    expect(recalled).toMatchObject({ status: 'recalled', text: '', image: null, mentions: [] });
  });

  it('系統訊息只有規定的欄位', () => {
    expect(toChatMessage({ ...base, kind: 'system', systemType: 'kicked', authorId: null }, url)).toEqual({
      id: 'm1',
      kind: 'system',
      createdAt: '2026-10-13T08:30:00.123Z',
      systemType: 'kicked',
      nickname: '小明',
    });
  });

  it('資料表的一列（snake_case）也能轉', () => {
    const row: MessageRow = {
      id: 'm1',
      kind: 'user',
      created_at: '2026-10-13T08:30:00+00:00',
      author_id: 'u1',
      nickname: '小明',
      is_admin: true,
      text: 'hi',
      image_path: null,
      image_width: null,
      image_height: null,
      mentions: null,
      edited_at: '2026-10-13T08:31:00+00:00',
      status: 'normal',
      system_type: null,
    };
    expect(toChatMessage(rowToJson(row), url)).toMatchObject({
      isAdmin: true,
      image: null,
      mentions: [],
      editedAt: '2026-10-13T08:31:00.000Z',
    });
  });

  it('toIso 看不懂的字串原樣留著', () => {
    expect(toIso('not a date')).toBe('not a date');
  });

  it('圖片副檔名', () => {
    expect(imageExtension('image/webp')).toBe('webp');
    expect(imageExtension('image/jpeg')).toBe('jpg');
    expect(imageExtension('image/gif')).toBe('gif');
  });
});
