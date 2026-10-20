import type { ChatService } from './ChatService';
import { MockChatService } from './mock/MockChatService';
import { SupabaseChatService } from './supabase/SupabaseChatService';

let instance: ChatService | null = null;

export function createChatService(): ChatService {
  if (instance) return instance;

  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.has('demo');
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const supabaseConfigured = Boolean(url && key);

  if (supabaseConfigured && !forceDemo) {
    instance = new SupabaseChatService(url!, key!);
    return instance;
  }

  const bots = params.has('bots') || window.location.hash === '#bots';
  instance = new MockChatService({ bots });
  return instance;
}