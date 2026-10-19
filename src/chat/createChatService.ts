/**
 * 決定要用示範版還是正式版（架構文件 4.0）：
 *
 * | 情況                              | 使用   |
 * |-----------------------------------|--------|
 * | 沒有設定 Supabase 的網址和金鑰      | 示範版 |
 * | 有設定                             | 正式版 |
 * | 網址加上 ?demo                     | 強制使用示範版 |
 *
 * 畫面層只拿到 ChatService 這個介面，不知道背後是哪一個版本。
 */
import type { ChatService } from './ChatService';
import { MockChatService } from './mock/MockChatService';

let instance: ChatService | null = null;

export function createChatService(): ChatService {
  if (instance) return instance;

  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.has('demo');
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const supabaseConfigured = Boolean(url && key);

  if (supabaseConfigured && !forceDemo) {
    // 階段二：在這裡改成 `instance = new SupabaseChatService(url, key)`，
    // 正式版的程式只能寫在 src/chat/supabase/ 裡。畫面層一行都不用改。
    console.warn('[chat] 已設定 Supabase，但正式版要到階段二才會做；先使用示範版。');
  }

  // ?bots 是架構文件的寫法；#bots 給不會傳遞網址參數的預覽環境用，效果一樣
  const bots = params.has('bots') || window.location.hash === '#bots';
  instance = new MockChatService({ bots });
  return instance;
}
