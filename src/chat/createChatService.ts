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
import { normalizeSupabaseUrl } from './supabase/mapping';
import { SupabaseChatService } from './supabase/SupabaseChatService';

let instance: ChatService | null = null;

export function createChatService(): ChatService {
  if (instance) return instance;

  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.has('demo');
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

  if (url && key && !forceDemo) {
    instance = new SupabaseChatService(normalizeSupabaseUrl(url), key);
    return instance;
  }

  // ?bots 是架構文件的寫法；#bots 給不會傳遞網址參數的預覽環境用，效果一樣
  const bots = params.has('bots') || window.location.hash === '#bots';
  instance = new MockChatService({ bots });
  return instance;
}
