/**
 * localStorage 的小包裝。無痕模式、被封鎖的網站資料等情況下 localStorage 可能會丟錯誤，
 * 所以每次讀寫都包在 try/catch 裡，失敗就當作沒有存東西。
 */
export function readJson<T>(key: string, fallback: T, store: Storage | undefined = safeLocal()): T {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, store: Storage | undefined = safeLocal()): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* 空間滿了或被瀏覽器禁止：放棄這次儲存 */
  }
}

export function safeLocal(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function safeSession(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** 畫面層自己用的設定（跟通訊層無關） */
export const UI_KEYS = {
  lastNickname: 'c4:last-nickname',
  background: 'c4:background',
} as const;
