import { RULES } from '../chat/rules';

export type NicknameProblem = 'empty' | 'too_long' | 'bad_chars' | 'no_letters' | 'reserved';

export type NicknameCheck =
  | { ok: true; nickname: string; key: string }
  | { ok: false; problem: NicknameProblem };

/**
 * 統一字形：NFKC（全形英數字 → 半形）、去掉頭尾空白、連續空白變成一個。
 * 零寬字元、控制字元不會在這裡去掉，而是留給 checkNickname 拒絕，
 * 這樣使用者才知道他的代號裡有看不見的東西。
 */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
}

/** 比對「是不是同一個代號」用的鍵：統一字形後再轉小寫 */
export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).toLowerCase();
}

/** 只允許文字、數字、底線、連字號和一般空格（架構文件 9.1） */
const ALLOWED = /^[\p{L}\p{M}\p{N}_\- ]+$/u;
const HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

export function checkNickname(raw: string): NicknameCheck {
  const nickname = normalizeNickname(raw);
  const length = [...nickname].length;
  if (length < RULES.nicknameMin) return { ok: false, problem: 'empty' };
  if (length > RULES.nicknameMax) return { ok: false, problem: 'too_long' };
  if (!ALLOWED.test(nickname)) return { ok: false, problem: 'bad_chars' };
  if (!HAS_LETTER_OR_NUMBER.test(nickname)) return { ok: false, problem: 'no_letters' };
  const key = nickname.toLowerCase();
  if (RULES.reservedNicknames.some((r) => r.normalize('NFKC').toLowerCase() === key)) {
    return { ok: false, problem: 'reserved' };
  }
  return { ok: true, nickname, key };
}

/** 代號長度（給畫面上的「2 / 16」用） */
export function nicknameLength(raw: string): number {
  return [...normalizeNickname(raw)].length;
}
