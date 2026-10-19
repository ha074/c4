import { describe, expect, it } from 'vitest';
import { extractMentions, safeHref, segmentMessage } from '../src/lib/linkify';

describe('segmentMessage 網址變成連結（架構文件 9.1）', () => {
  it('http 和 https 網址變成連結', () => {
    expect(segmentMessage('看這個 https://example.com/a?b=1 好看')).toEqual([
      { type: 'text', text: '看這個 ' },
      { type: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', text: ' 好看' },
    ]);
  });

  it('javascript: 不會變成連結', () => {
    const segs = segmentMessage('javascript:alert(1)');
    expect(segs.every((s) => s.type === 'text')).toBe(true);
  });

  it('safeHref 只接受 http 和 https', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://example.com')).toBe('https://example.com/');
  });

  it('網址後面的中英文標點不算在網址裡', () => {
    const segs = segmentMessage('去 https://example.com。');
    expect(segs[1]).toEqual({ type: 'link', text: 'https://example.com', href: 'https://example.com/' });
    expect(segs[2]).toEqual({ type: 'text', text: '。' });
  });

  it('HTML 只是文字', () => {
    expect(segmentMessage('<b>粗體</b><script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<b>粗體</b><script>alert(1)</script>' },
    ]);
  });
});

describe('@ 提及', () => {
  it('只標出訊息裡記錄的代號', () => {
    expect(segmentMessage('@阿華 你好 @路人', ['阿華'])).toEqual([
      { type: 'mention', text: '@阿華', nickname: '阿華' },
      { type: 'text', text: ' 你好 @路人' },
    ]);
  });

  it('長的代號優先：@小明明 不會被當成 @小明', () => {
    expect(segmentMessage('@小明明', ['小明', '小明明'])[0]).toEqual({
      type: 'mention',
      text: '@小明明',
      nickname: '小明明',
    });
  });

  it('extractMentions 只認線上名單裡的代號', () => {
    expect(extractMentions('@阿華 @不在線 @小明 嗨', ['小明', '阿華', '阿貓'])).toEqual(['阿華', '小明']);
    expect(extractMentions('沒有提到任何人', ['小明'])).toEqual([]);
  });
});
