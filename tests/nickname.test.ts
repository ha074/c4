import { describe, expect, it } from 'vitest';
import { checkNickname, nicknameKey } from '../src/lib/nickname';

describe('checkNickname 代號規則（架構文件 9.1、13.1）', () => {
  it('接受一般的中文、英文、數字、底線、連字號和空格', () => {
    for (const name of ['小明', 'xiao', 'user_01', 'a-b', '小 明', '1', '一二三四五六七八九十一二三四五六']) {
      expect(checkNickname(name)).toMatchObject({ ok: true });
    }
  });

  it('去掉頭尾空白', () => {
    expect(checkNickname('  小明  ')).toMatchObject({ ok: true, nickname: '小明' });
  });

  it('空白或只有空白：拒絕', () => {
    expect(checkNickname('')).toEqual({ ok: false, problem: 'empty' });
    expect(checkNickname('    ')).toEqual({ ok: false, problem: 'empty' });
  });

  it('17 個字：拒絕', () => {
    expect(checkNickname('一二三四五六七八九十一二三四五六七')).toEqual({ ok: false, problem: 'too_long' });
  });

  it('字數用「字」算，不是用位元組：16 個 emoji 以外的字可以', () => {
    expect(checkNickname('ＡＢＣ')).toMatchObject({ ok: true, nickname: 'ABC' });
  });

  it('含零寬字元、控制字元：拒絕', () => {
    expect(checkNickname('小​明')).toEqual({ ok: false, problem: 'bad_chars' });
    expect(checkNickname('小\u0007明')).toEqual({ ok: false, problem: 'bad_chars' });
    expect(checkNickname('小‍明')).toEqual({ ok: false, problem: 'bad_chars' });
  });

  it('特殊符號：拒絕', () => {
    expect(checkNickname('<script>')).toEqual({ ok: false, problem: 'bad_chars' });
    expect(checkNickname('小明!')).toEqual({ ok: false, problem: 'bad_chars' });
  });

  it('只有底線或連字號：拒絕', () => {
    expect(checkNickname('___')).toEqual({ ok: false, problem: 'no_letters' });
    expect(checkNickname('- -')).toEqual({ ok: false, problem: 'no_letters' });
  });

  it('冒充管理員或系統：拒絕（不分大小寫、全半形）', () => {
    expect(checkNickname('admin')).toEqual({ ok: false, problem: 'reserved' });
    expect(checkNickname('ADMIN')).toEqual({ ok: false, problem: 'reserved' });
    expect(checkNickname('ａｄｍｉｎ')).toEqual({ ok: false, problem: 'reserved' });
    expect(checkNickname('管理員')).toEqual({ ok: false, problem: 'reserved' });
    expect(checkNickname('系統')).toEqual({ ok: false, problem: 'reserved' });
  });
});

describe('nicknameKey 判斷是不是同一個代號', () => {
  it('xiao、XIAO、全形 ｘｉａｏ 都算同一個', () => {
    expect(nicknameKey('XIAO')).toBe(nicknameKey('xiao'));
    expect(nicknameKey('ｘｉａｏ')).toBe(nicknameKey('xiao'));
    expect(nicknameKey(' xiao ')).toBe(nicknameKey('xiao'));
  });

  it('不同的代號不一樣', () => {
    expect(nicknameKey('小明')).not.toBe(nicknameKey('小華'));
  });
});
