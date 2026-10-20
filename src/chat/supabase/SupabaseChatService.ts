import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { ChatService } from '../ChatService';
import {
  ChatEventName,
  ChatEvents,
  ChatMessage,
  ConnectionStatus,
  EditError,
  Id,
  JoinError,
  KickDuration,
  NetworkError,
  NotifyMode,
  OnlineUser,
  PushError,
  RecallError,
  Result,
  SendError,
  SendInput,
  SystemMessage,
  UserMessage,
  ok,
  fail,
} from '../types';

export class SupabaseChatService implements ChatService {
  readonly mode = 'live' as const;
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private currentUserId: Id = crypto.randomUUID();
  private currentNickname: string = '';
  private me: OnlineUser | null = null;
  private onlineUsers: Map<string, OnlineUser> = new Map();
  private listeners: { [K in ChatEventName]?: Array<(payload: any) => void> } = {};
  private status: ConnectionStatus = 'online';
  private notifyMode: NotifyMode = 'all';

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key);
  }

  async join(nickname: string): Promise<Result<OnlineUser, JoinError>> {
    this.currentNickname = nickname.trim();
    this.me = {
      userId: this.currentUserId,
      nickname: this.currentNickname,
      isAdmin: false,
      isMe: true,
    };

    this.onlineUsers.set(this.currentUserId, this.me);
    this.status = 'online';

    setTimeout(() => {
      this.emit('connection:status', 'online');
      this.emit('presence:sync', this.getOnlineUsers());
    }, 0);

    this.channel = this.supabase.channel('messages_realtime', {
      config: { presence: { key: this.currentUserId } },
    });

    this.channel
      .on('broadcast', { event: 'system_leave' }, ({ payload }: { payload: any }) => {
        if (payload && payload.nickname) {
          this.emit('message:new', payload as SystemMessage);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        this.onlineUsers.clear();
        if (this.me) this.onlineUsers.set(this.currentUserId, this.me);

        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          if (presences && presences.length > 0) {
            const u = presences[0]?.user;
            if (u && u.userId && u.nickname) {
              this.onlineUsers.set(u.userId, {
                userId: u.userId,
                nickname: u.nickname,
                isAdmin: Boolean(u.isAdmin),
                isMe: u.userId === this.currentUserId,
              });
            }
          }
        }
        this.emit('presence:sync', this.getOnlineUsers());
      })
      .on('presence', { event: 'join' }, ({ newPresences }: { newPresences: any[] }) => {
        for (const p of newPresences) {
          const u = p?.user;
          if (u && u.userId !== this.currentUserId && u.nickname) {
            const sysMsg: SystemMessage = {
              id: crypto.randomUUID(),
              kind: 'system',
              createdAt: new Date().toISOString(),
              systemType: 'join',
              nickname: u.nickname,
            };
            this.emit('message:new', sysMsg);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }: { leftPresences: any[] }) => {
        for (const p of leftPresences) {
          const u = p?.user;
          if (u && u.nickname) {
            const sysMsg: SystemMessage = {
              id: crypto.randomUUID(),
              kind: 'system',
              createdAt: new Date().toISOString(),
              systemType: 'leave',
              nickname: u.nickname,
            };
            this.emit('message:new', sysMsg);
          }
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const row = payload.new as any;
          const msg: UserMessage = {
            id: row.id,
            kind: 'user',
            createdAt: row.created_at || new Date().toISOString(),
            authorId: row.author_id || 'unknown',
            nickname: row.nickname || '\u533f\u540d',
            isAdmin: Boolean(row.is_admin),
            text: row.content || '',
            image: row.image_url
              ? { url: row.image_url, width: row.image_width || 300, height: row.image_height || 200 }
              : null,
            mentions: row.mentions || [],
            editedAt: row.edited_at || null,
            status: row.status || 'normal',
          };
          this.emit('message:new', msg);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload: any) => {
          const row = payload.new as any;
          const msg: UserMessage = {
            id: row.id,
            kind: 'user',
            createdAt: row.created_at || new Date().toISOString(),
            authorId: row.author_id || 'unknown',
            nickname: row.nickname || '\u533f\u540d',
            isAdmin: Boolean(row.is_admin),
            text: row.content || '',
            image: row.image_url
              ? { url: row.image_url, width: row.image_width || 300, height: row.image_height || 200 }
              : null,
            mentions: row.mentions || [],
            editedAt: row.edited_at || null,
            status: row.status || 'normal',
          };
          this.emit('message:updated', msg);
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (this.me) this.channel?.track({ user: this.me });
          this.status = 'online';
          this.emit('connection:status', 'online');
          this.emit('presence:sync', this.getOnlineUsers());
        }
      });

    return ok(this.me);
  }

  async leave(): Promise<void> {
    if (this.channel && this.currentNickname) {
      const sysMsg: SystemMessage = {
        id: crypto.randomUUID(),
        kind: 'system',
        createdAt: new Date().toISOString(),
        systemType: 'leave',
        nickname: this.currentNickname,
      };

      try {
        await this.channel.send({
          type: 'broadcast',
          event: 'system_leave',
          payload: sysMsg,
        });
      } catch (e) {
        console.warn('leave broadcast failed', e);
      }

      await this.channel.untrack();
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.onlineUsers.clear();
    this.status = 'offline';
    this.emit('connection:status', 'offline');
  }

  async loadRecent(limit = 50): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      kind: 'user' as const,
      createdAt: row.created_at || new Date().toISOString(),
      authorId: row.author_id || 'unknown',
      nickname: row.nickname || '\u533f\u540d',
      isAdmin: Boolean(row.is_admin),
      text: row.content || '',
      image: row.image_url
        ? { url: row.image_url, width: row.image_width || 300, height: row.image_height || 200 }
        : null,
      mentions: row.mentions || [],
      editedAt: row.edited_at || null,
      status: row.status || 'normal',
    }));
  }

  async sendMessage(input: SendInput): Promise<Result<ChatMessage, SendError>> {
    if (!this.currentNickname) return fail('network');

    let uploadedImageUrl: string | null = null;
    let imgWidth = 0;
    let imgHeight = 0;

    if (input.image) {
      imgWidth = input.image.width;
      imgHeight = input.image.height;
      const path = `${Date.now()}-${crypto.randomUUID()}`;
      const { error: uploadErr } = await this.supabase.storage
        .from('chat-images')
        .upload(path, input.image.blob);

      if (!uploadErr) {
        const { data: urlData } = this.supabase.storage
          .from('chat-images')
          .getPublicUrl(path);
        uploadedImageUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        nickname: this.currentNickname,
        author_id: this.currentUserId,
        content: input.text || '',
        image_url: uploadedImageUrl,
        image_width: imgWidth,
        image_height: imgHeight,
        mentions: input.mentions || [],
        status: 'normal',
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[Supabase sendMessage error]:', error);
      return fail('network');
    }

    const message: UserMessage = {
      id: data.id,
      kind: 'user',
      createdAt: data.created_at,
      authorId: data.author_id || this.currentUserId,
      nickname: data.nickname,
      isAdmin: Boolean(data.is_admin),
      text: data.content,
      image: data.image_url
        ? { url: data.image_url, width: data.image_width, height: data.image_height }
        : null,
      mentions: data.mentions || [],
      editedAt: null,
      status: 'normal',
    };

    return ok(message);
  }

  async editMessage(id: Id, text: string): Promise<Result<ChatMessage, EditError>> {
    const { data, error } = await this.supabase
      .from('messages')
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return fail('network');

    const msg: UserMessage = {
      id: data.id,
      kind: 'user',
      createdAt: data.created_at,
      authorId: data.author_id,
      nickname: data.nickname,
      isAdmin: Boolean(data.is_admin),
      text: data.content,
      image: data.image_url
        ? { url: data.image_url, width: data.image_width, height: data.image_height }
        : null,
      mentions: data.mentions || [],
      editedAt: data.edited_at,
      status: data.status,
    };
    return ok(msg);
  }

  async recallMessage(id: Id): Promise<Result<ChatMessage, RecallError>> {
    const { data, error } = await this.supabase
      .from('messages')
      .update({ status: 'recalled' })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return fail('network');

    const msg: UserMessage = {
      id: data.id,
      kind: 'user',
      createdAt: data.created_at,
      authorId: data.author_id,
      nickname: data.nickname,
      isAdmin: Boolean(data.is_admin),
      text: data.content,
      image: data.image_url
        ? { url: data.image_url, width: data.image_width, height: data.image_height }
        : null,
      mentions: data.mentions || [],
      editedAt: data.edited_at,
      status: 'recalled',
    };
    return ok(msg);
  }

  async adminLogin(_e: string, _p: string) {
    return fail('not_admin' as const);
  }

  async adminRemoveMessage(id: Id) {
    return this.recallMessage(id) as any;
  }

  async adminKick(_userId: Id, _duration: KickDuration) {
    return fail('not_admin' as const);
  }

  isAdmin(): boolean {
    return false;
  }

  async setNotifyMode(mode: NotifyMode): Promise<Result<void, NetworkError>> {
    this.notifyMode = mode;
    return ok(undefined);
  }

  getNotifyMode(): NotifyMode {
    return this.notifyMode;
  }

  async enablePush(): Promise<Result<void, PushError>> {
    return fail('unsupported');
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  getOnlineUsers(): OnlineUser[] {
    if (this.onlineUsers.size === 0 && this.me) {
      return [this.me];
    }
    return Array.from(this.onlineUsers.values());
  }

  on<E extends ChatEventName>(event: E, handler: (payload: ChatEvents[E]) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
    return () => {
      this.listeners[event] = this.listeners[event]!.filter((h) => h !== handler);
    };
  }

  private emit<E extends ChatEventName>(event: E, payload: ChatEvents[E]) {
    const handlers = this.listeners[event];
    if (handlers) {
      for (const h of handlers) {
        h(payload);
      }
    }
  }
}