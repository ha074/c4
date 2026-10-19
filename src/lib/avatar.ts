/** 頭像顏色：用代號算出固定的一組（同一個人永遠同色）。管理員固定深色。 */
const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#E6E1F5', '#4A3D7A'],
  ['#DCEBE3', '#2F5B45'],
  ['#D7E6F0', '#24516B'],
  ['#F3E0E0', '#7A2E2E'],
  ['#E9E0FA', '#5A3F9E'],
  ['#F6E7D2', '#6B4A1F'],
];

export function avatarColors(nickname: string, isAdmin = false): { background: string; color: string } {
  if (isAdmin) return { background: 'var(--ink)', color: '#FFFFFF' };
  let hash = 0;
  for (const ch of nickname) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const [background, color] = PALETTE[hash % PALETTE.length];
  return { background, color };
}

/** 頭像上的字：代號的第一個字（英文用大寫） */
export function avatarInitial(nickname: string): string {
  const first = [...nickname.trim()][0] ?? '?';
  return first.toUpperCase();
}
