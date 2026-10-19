import { readJson, UI_KEYS, writeJson } from './storage';

/** 聊天背景顏色（docs/design.md 6.1）：只存在這台裝置，別人看不到 */
export interface BackgroundOption {
  name: string;
  color: string;
}

export const DEFAULT_BACKGROUND = '#F5F2FB';

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { name: '淡紫（預設）', color: DEFAULT_BACKGROUND },
  { name: '薄荷', color: '#E8F1EC' },
  { name: '天空', color: '#E7EFF6' },
  { name: '蜜桃', color: '#FBEDE6' },
  { name: '米白', color: '#F6F2EC' },
  { name: '奶油', color: '#F5F0D8' },
  { name: '石灰', color: '#ECEAE6' },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function loadBackground(): string {
  const saved = readJson<string>(UI_KEYS.background, DEFAULT_BACKGROUND);
  return HEX.test(saved) ? saved : DEFAULT_BACKGROUND;
}

export function saveBackground(color: string): void {
  writeJson(UI_KEYS.background, color);
}

/** 相對亮度（WCAG 的算法） */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * 套用背景。背景太深時（灰字對比不足 4.5:1），把直接畫在背景上的字
 * （時間、系統訊息、日期分隔線）自動換成淺色，解決 design.md 第 7 節的第 3 點。
 */
export function applyBackground(color: string): void {
  const root = document.documentElement;
  const safe = HEX.test(color) ? color : DEFAULT_BACKGROUND;
  root.style.setProperty('--bg', safe);
  const muted = luminance('#6A6280');
  const bg = luminance(safe);
  const contrast = (Math.max(bg, muted) + 0.05) / (Math.min(bg, muted) + 0.05);
  const dark = contrast < 4.5 && bg < 0.25;
  root.dataset.bg = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', safe);
}
