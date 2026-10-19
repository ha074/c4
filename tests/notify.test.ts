import { describe, expect, it } from 'vitest';
import type { UserMessage } from '../src/chat/types';
import { shouldNotify } from '../src/lib/notify';
import { luminance } from '../src/lib/theme';
import { formatDateSeparator, formatMessageTime } from '../src/lib/time';

const me = { userId: 'me', nickname: '小明' };
const base: UserMessage = {
  id: '1',
  kind: 'user',
  createdAt: '2026-10-13T08:30:00Z',
  authorId: 'other',
  nickname: '阿華',
  isAdmin: false,
  text: '嗨',
  image: null,
  mentions: [],
  editedAt: null,
  status: 'normal',
};

describe('shouldNotify 通知規則（架構文件 6.6）', () => {
  it('off：不通知', () => {
    expect(shouldNotify({ ...base, mentions: ['小明'] }, 'off', me)).toBe(false);
  });
  it('mentions：只有 @ 到我才通知', () => {
    expect(shouldNotify(base, 'mentions', me)).toBe(false);
    expect(shouldNotify({ ...base, mentions: ['小明'] }, 'mentions', me)).toBe(true);
  });
  it('all：每則都通知', () => {
    expect(shouldNotify(base, 'all', me)).toBe(true);
  });
  it('自己送的訊息永遠不通知自己', () => {
    expect(shouldNotify({ ...base, authorId: 'me', mentions: ['小明'] }, 'all', me)).toBe(false);
  });
  it('收回的訊息、系統訊息不通知', () => {
    expect(shouldNotify({ ...base, status: 'recalled' }, 'all', me)).toBe(false);
    expect(
      shouldNotify({ id: '2', kind: 'system', createdAt: base.createdAt, systemType: 'join', nickname: 'x' }, 'all', me),
    ).toBe(false);
  });
});

describe('時間格式', () => {
  const now = new Date(2026, 9, 18, 15, 0);
  it('今天只顯示時間，更早的加日期', () => {
    expect(formatMessageTime(new Date(2026, 9, 18, 14, 30).toISOString(), now)).toBe('14:30');
    expect(formatMessageTime(new Date(2026, 9, 17, 23, 12).toISOString(), now)).toBe('10/17 23:12');
  });
  it('日期分隔線', () => {
    expect(formatDateSeparator(new Date(2026, 9, 18, 9).toISOString(), now)).toBe('今天');
    expect(formatDateSeparator(new Date(2026, 9, 17, 9).toISOString(), now)).toBe('10月17日 星期六');
  });
});

describe('背景亮度', () => {
  it('白色最亮、黑色最暗', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    expect(luminance('#000000')).toBeCloseTo(0);
  });
});
