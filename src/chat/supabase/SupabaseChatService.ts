/**
 * 階段二：正式版通訊層（架構文件 4.2、5、6）。
 *
 * 整個專案只有 src/chat/supabase/ 可以使用 Supabase。畫面層只認 ChatService。
 *
 * - 身分：Supabase 匿名登入，存在這個瀏覽器（重新整理後還是同一個人）
 * - 寫入：一律呼叫資料庫函式（supabase/migrations/0001_chat.sql），規則在資料庫那一端檢查
 * - 即時：私人頻道 room:lobby。資料庫廣播 message_inserted / message_updated / member_kicked；
 *   線上名單用 Presence
 * - 心跳：每 20 秒一次；代號被拿走或被踢了，由心跳的結果告訴畫面
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatService } from '../ChatService';
import { Emitter } from '../emitter';
import { RULES } from '../rules';
import {
  fail,
  ok,
  type AdminError,
  type AdminLoginError,
  type ChatEventName,
  type ChatEvents,
  type ChatMessage,
  type ConnectionStatus,
  type EditError,
  type Id,
  type IsoTime,
  type JoinError,
  type KickDuration,
  type NetworkError,
  type NotifyMode,
  type OnlineUser,
  type PushError,
  type RecallError,
  type Result,
  type SendError,
  type SendInput,
} from '../types';
import { uuid } from '../uuid';
import { extractMentions } from '../../lib/linkify';
import { readJson, writeJson } from '../../lib/storage';
import { imageExtension, rowToJson, toChatMessage, type MessageJson, type MessageRow } from './mapping';

const TOPIC = 'room:lobby';
const BUCKET = 'chat-images';
const HEARTBEAT_MS = 20_000;
const SUBSCRIBE_WAIT_MS = 8_000;
const NOTIFY_KEY = 'c4:notify-mode';

/** 資料庫函式的回傳格式 */
type RpcResult =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; code: string; until?: IsoTime | null };

interface PresencePayload {
  userId: string;
  nickname: string;
  isAdmin: boolean;
}

interface Me {
  userId: Id;
  nickname: string;
  isAdmin: boolean;
}

export class SupabaseChatService implements ChatService {
  readonly mode = 'live' as const;

  private readonly supabase: SupabaseClient;
  private readonly emitter = new Emitter<ChatEvents>();
  private channel: RealtimeChannel | null = null;
  private me: Me | null = null;
  private admin = false;
  private status: ConnectionStatus = 'connecting';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatWorker: Worker | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 線上名單：最後一次在 Presence 看到的時間（斷線 10 秒內先不拿掉，架構文件 6.3） */
  private readonly seen = new Map<Id, { user: PresencePayload; at: number }>();
  /** 已經交給畫面的訊息（重連時用來補漏掉的訊息） */
  private readonly known = new Map<Id, string>();
  /** 曾經連上過：之後再收到 SUBSCRIBED 就代表是「重連成功」 */
  private everSubscribed = false;

  constructor(url: string, publishableKey: string) {
    this.supabase = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'c4-auth' },
    });
    void this.refreshAdminFlag();

    window.addEventListener('offline', () => {
      if (this.me) this.setStatus('offline');
    });
    window.addEventListener('online', () => {
      if (!this.me) return;
      // 網路只斷一下、頻道其實沒掉：直接恢復；真的掉了就等 Realtime 自己重連（重連成功時會補訊息）
      if (this.channelJoined()) {
        this.setStatus('online');
        void this.recover();
      } else {
        this.setStatus('reconnecting');
      }
    });
    // 手機從背景切回來：主動補一次（架構文件 6.4 第 4 步）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.recover();
    });
  }

  /* ================= 動作（5.1） ================= */

  async join(nickname: string): Promise<Result<OnlineUser, JoinError>> {
    const session = await this.ensureSession();
    if (!session) return fail('network');

    const { data, error } = await this.supabase.rpc('join_room', { p_nickname: nickname });
    if (error || !data) return fail('network');
    const result = data as RpcResult;
    if (!result.ok) {
      if (result.code === 'nickname_taken' || result.code === 'nickname_invalid') return fail(result.code);
      if (result.code === 'banned') return fail('banned', result.until ?? null);
      return fail('network');
    }

    const user = result.user as Me;
    this.me = { userId: user.userId, nickname: user.nickname, isAdmin: Boolean(user.isAdmin) };
    this.admin = this.me.isAdmin;
    this.seen.clear();
    this.known.clear();

    await this.subscribe(session.access_token);
    this.startHeartbeat();
    // 私人頻道剛連上的頭幾秒，資料庫的廣播偶爾會漏：5 秒後補抓一次
    setTimeout(() => void this.catchUp(), 5_000);
    return ok(this.meAsOnlineUser());
  }

  async leave(): Promise<void> {
    if (!this.me) return;
    this.stopHeartbeat();
    this.me = null;
    try {
      await this.supabase.rpc('leave_room');
    } catch {
      /* 送不到也沒關係：伺服器 60 秒後會自己釋放代號 */
    }
    await this.teardownChannel();
    this.emitPresence();
  }

  async loadRecent(limit: number = RULES.historyLimit): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const list = (data as MessageRow[]).reverse().map((row) => this.toMessage(rowToJson(row)));
    for (const m of list) this.known.set(m.id, JSON.stringify(m));
    return list;
  }

  sendMessage(input: SendInput): Promise<Result<ChatMessage, SendError>> {
    return this.sendNow(input, false);
  }

  private async sendNow(input: SendInput, retried: boolean): Promise<Result<ChatMessage, SendError>> {
    if (!this.me) return fail('network');
    if ([...input.text].length > RULES.messageMax) return fail('too_long');

    let imagePath: string | null = null;
    if (input.image) {
      if (!RULES.imageTypes.includes(input.image.blob.type)) return fail('image_type_not_allowed');
      if (input.image.blob.size > RULES.imageMaxBytes) return fail('image_too_large');
      // 只能放在 chat-images/<自己的ID>/（Storage 規則也會再擋一次）
      imagePath = `${this.me.userId}/${uuid()}.${imageExtension(input.image.blob.type)}`;
      const { error } = await this.supabase.storage
        .from(BUCKET)
        .upload(imagePath, input.image.blob, { contentType: input.image.blob.type, upsert: false });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('size') || message.includes('exceed') || message.includes('too large')) return fail('image_too_large');
        if (message.includes('mime') || message.includes('type')) return fail('image_type_not_allowed');
        return fail('network');
      }
    }

    const { data, error } = await this.supabase.rpc('send_message', {
      p_text: input.text,
      p_image_path: imagePath,
      p_image_width: input.image?.width ?? null,
      p_image_height: input.image?.height ?? null,
      p_mentions: input.mentions,
    });
    const result = data as RpcResult | null;
    if (error || !result || !result.ok) {
      if (imagePath) void this.removeImage(imagePath);
      if (!result || result.ok || error) return fail('network');
      switch (result.code) {
        case 'rate_limited':
        case 'too_long':
        case 'image_type_not_allowed':
          return fail(result.code);
        case 'banned':
          this.onKicked(result.until ?? null);
          return fail('banned', result.until ?? null);
        case 'nickname_lost':
          // 只重試一次，避免伺服器一直回同樣的答案時無限重試
          if (!retried && (await this.tryRejoin()) && this.me) return this.sendNow(input, true);
          return fail('network');
        default:
          return fail('network');
      }
    }
    const message = this.toMessage(result.message as MessageJson);
    this.known.set(message.id, JSON.stringify(message));
    return ok(message);
  }

  async editMessage(id: Id, text: string): Promise<Result<ChatMessage, EditError>> {
    if ([...text].length > RULES.messageMax) return fail('too_long');
    const mentions = extractMentions(text, this.onlineUsers().map((u) => u.nickname));
    const { data, error } = await this.supabase.rpc('edit_message', { p_id: id, p_text: text, p_mentions: mentions });
    const result = data as RpcResult | null;
    if (error || !result) return fail('network');
    if (!result.ok) {
      if (result.code === 'not_owner' || result.code === 'too_long' || result.code === 'message_gone') return fail(result.code);
      return fail('network');
    }
    return ok(this.toMessage(result.message as MessageJson));
  }

  async recallMessage(id: Id): Promise<Result<ChatMessage, RecallError>> {
    const { data, error } = await this.supabase.rpc('recall_message', { p_id: id });
    const result = data as RpcResult | null;
    if (error || !result) return fail('network');
    if (!result.ok) {
      if (result.code === 'not_owner' || result.code === 'message_gone') return fail(result.code);
      return fail('network');
    }
    // 收回後把 Storage 裡的圖片也刪掉（架構文件 6.2）
    if (typeof result.deletedImagePath === 'string') void this.removeImage(result.deletedImagePath);
    return ok(this.toMessage(result.message as MessageJson));
  }

  async adminLogin(email: string, password: string): Promise<Result<void, AdminLoginError>> {
    const { error } = await this.supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 400 || status === 401 || /invalid/i.test(error.message)) return fail('wrong_credentials');
      return fail('network');
    }
    const { data, error: checkError } = await this.supabase.rpc('am_i_admin');
    if (checkError) return fail('network');
    if (data !== true) {
      // 帳號密碼對、但不是管理員：登出，下次進入時重新拿匿名身分
      await this.supabase.auth.signOut();
      this.admin = false;
      return fail('not_admin');
    }
    this.admin = true;
    return ok(undefined);
  }

  async adminRemoveMessage(id: Id): Promise<Result<ChatMessage, AdminError>> {
    const { data, error } = await this.supabase.rpc('admin_remove_message', { p_id: id });
    const result = data as RpcResult | null;
    if (error || !result) return fail('network');
    if (!result.ok) {
      if (result.code === 'not_admin' || result.code === 'message_gone') return fail(result.code);
      return fail('network');
    }
    if (typeof result.deletedImagePath === 'string') void this.removeImage(result.deletedImagePath);
    return ok(this.toMessage(result.message as MessageJson));
  }

  async adminKick(userId: Id, duration: KickDuration): Promise<Result<void, AdminError>> {
    const { data, error } = await this.supabase.rpc('admin_kick', { p_user: userId, p_duration: duration });
    const result = data as RpcResult | null;
    if (error || !result) return fail('network');
    if (!result.ok) return result.code === 'not_admin' ? fail('not_admin') : fail('network');
    this.seen.delete(userId);
    this.emitPresence();
    return ok(undefined);
  }

  isAdmin(): boolean {
    return this.admin;
  }

  async setNotifyMode(mode: NotifyMode): Promise<Result<void, NetworkError>> {
    writeJson(NOTIFY_KEY, mode);
    // 存一份到資料庫，之後的 Web Push 會用到；送不到不影響這台裝置的設定
    void this.supabase.rpc('set_notify_mode', { p_mode: mode }).then(
      () => undefined,
      () => undefined,
    );
    return ok(undefined);
  }

  getNotifyMode(): NotifyMode {
    const mode = readJson<NotifyMode>(NOTIFY_KEY, 'mentions');
    return mode === 'all' || mode === 'off' ? mode : 'mentions';
  }

  async enablePush(): Promise<Result<void, PushError>> {
    // 網頁關掉也收得到的推播需要 Service Worker、VAPID 金鑰和 Edge Function send-push，還沒接上
    return fail('unsupported');
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  getOnlineUsers(): OnlineUser[] {
    return this.onlineUsers();
  }

  on<E extends ChatEventName>(event: E, handler: (payload: ChatEvents[E]) => void): () => void {
    return this.emitter.on(event, handler);
  }

  /* ================= 連線 ================= */

  private async ensureSession() {
    const { data } = await this.supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: signedIn, error } = await this.supabase.auth.signInAnonymously();
    if (error || !signedIn.session) return null;
    return signedIn.session;
  }

  private async refreshAdminFlag(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    const { data: isAdmin } = await this.supabase.rpc('am_i_admin');
    this.admin = isAdmin === true;
  }

  private async subscribe(accessToken: string): Promise<void> {
    await this.teardownChannel();
    // 私人頻道要帶著身分加入（Realtime Authorization）
    await this.supabase.realtime.setAuth(accessToken);
    this.setStatus('connecting');
    this.everSubscribed = false;

    const me = this.me;
    if (!me) return;
    const channel = this.supabase.channel(TOPIC, {
      config: { private: true, presence: { key: me.userId } },
    });
    this.channel = channel;

    channel
      .on('broadcast', { event: 'message_inserted' }, ({ payload }) => this.onMessage(payload as MessageJson, 'message:new'))
      .on('broadcast', { event: 'message_updated' }, ({ payload }) => this.onMessage(payload as MessageJson, 'message:updated'))
      .on('broadcast', { event: 'member_kicked' }, ({ payload }) => {
        const p = payload as { userId: string; until: IsoTime | null };
        if (this.me && p.userId === this.me.userId) this.onKicked(p.until ?? null);
        else {
          this.seen.delete(p.userId);
          this.emitPresence();
        }
      })
      .on('presence', { event: 'sync' }, () => this.onPresenceSync());

    await new Promise<void>((resolve) => {
      const giveUp = setTimeout(resolve, SUBSCRIBE_WAIT_MS);
      channel.subscribe((state) => {
        if (channel !== this.channel) return;
        const status = String(state);
        if (status === 'SUBSCRIBED') {
          clearTimeout(giveUp);
          const reconnected = this.everSubscribed;
          this.everSubscribed = true;
          if (this.me) void channel.track({ userId: this.me.userId, nickname: this.me.nickname, isAdmin: this.me.isAdmin });
          this.setStatus('online');
          if (reconnected) void this.recover();
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.setStatus(navigator.onLine ? 'reconnecting' : 'offline');
        } else if (status === 'CLOSED' && this.me) {
          this.setStatus('reconnecting');
        }
      });
    });
  }

  private async teardownChannel(): Promise<void> {
    const channel = this.channel;
    this.channel = null;
    if (!channel) return;
    try {
      await channel.untrack();
    } catch {
      /* 已經斷線 */
    }
    await this.supabase.removeChannel(channel);
  }

  /** 連回來、或從背景切回來：送心跳、補漏掉的訊息（架構文件 6.4） */
  private async recover(): Promise<void> {
    if (!this.me) return;
    const alive = await this.heartbeat();
    if (!alive || !this.me) return;
    await this.catchUp();
    if (this.channel && this.status === 'online') {
      void this.channel.track({ userId: this.me.userId, nickname: this.me.nickname, isAdmin: this.me.isAdmin });
    }
  }

  /** 把資料庫裡最近的訊息和畫面上的比一比，補上漏掉的、更新改過的 */
  private async catchUp(): Promise<void> {
    if (!this.me) return;
    const recent = await this.loadRecentForCatchUp();
    for (const m of recent) {
      const before = this.known.get(m.id);
      const now = JSON.stringify(m);
      if (before === now) continue;
      this.known.set(m.id, now);
      this.emitter.emit(before ? 'message:updated' : 'message:new', m);
    }
  }

  private async loadRecentForCatchUp(): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RULES.historyLimit);
    if (error || !data) return [];
    return (data as MessageRow[]).reverse().map((row) => this.toMessage(rowToJson(row)));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // 分頁在背景時，網頁裡的計時器會被瀏覽器放慢到一分鐘一次，心跳就會超過 60 秒的期限。
    // 所以優先用 Worker 計時（public/heartbeat-worker.js）；不支援時才用一般的計時器。
    try {
      const worker = new Worker(`${import.meta.env.BASE_URL}heartbeat-worker.js`);
      worker.onmessage = () => void this.heartbeat();
      worker.postMessage({ type: 'start', intervalMs: HEARTBEAT_MS });
      this.heartbeatWorker = worker;
    } catch {
      this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.heartbeatWorker?.terminate();
    this.heartbeatWorker = null;
  }

  /** 回傳 false 代表已經不在聊天室裡了（被踢、或代號被別人拿走） */
  private async heartbeat(): Promise<boolean> {
    if (!this.me) return false;
    const { data, error } = await this.supabase.rpc('heartbeat');
    const result = data as RpcResult | null;
    if (error || !result) return true; // 網路問題：下次再試
    if (result.ok) return true;
    if (result.code === 'banned') {
      this.onKicked(result.until ?? null);
      return false;
    }
    if (result.code === 'nickname_lost') return this.tryRejoin();
    return true;
  }

  /**
   * 伺服器已經釋放了我的代號（例如手機切到別的 App 太久）。
   * 代號還沒被別人用：自動恢復，其他人會看到「進入了聊天室」；被別人用了：回到進入畫面（架構文件 6.4、13.2）。
   */
  private async tryRejoin(): Promise<boolean> {
    const me = this.me;
    if (!me) return false;
    const { data, error } = await this.supabase.rpc('join_room', { p_nickname: me.nickname });
    const result = data as RpcResult | null;
    if (error || !result) return true; // 網路問題：下次再試
    if (result.ok) {
      if (this.channel && this.channelJoined()) {
        void this.channel.track({ userId: me.userId, nickname: me.nickname, isAdmin: me.isAdmin });
      }
      return true;
    }
    if (result.code === 'banned') this.onKicked(result.until ?? null);
    else this.onNicknameLost();
    return false;
  }

  /* ================= 收到的東西 ================= */

  private onMessage(json: MessageJson, event: 'message:new' | 'message:updated'): void {
    const message = this.toMessage(json);
    const now = JSON.stringify(message);
    const before = this.known.get(message.id);
    if (before === now) return; // 自己送出的訊息：畫面已經有了
    this.known.set(message.id, now);
    this.emitter.emit(before && event === 'message:new' ? 'message:updated' : event, message);
  }

  private onPresenceSync(): void {
    const channel = this.channel;
    if (!channel) return;
    const now = Date.now();
    // 在名單上的人更新「最後看到的時間」；不在的人保留原本的時間，10 秒後才拿掉（避免手機訊號不穩時名單一直閃）
    for (const entries of Object.values(this.presence(channel))) {
      const p = entries[0];
      if (p?.userId && p.nickname) {
        this.seen.set(p.userId, { user: { userId: p.userId, nickname: p.nickname, isAdmin: Boolean(p.isAdmin) }, at: now });
      }
    }
    this.emitPresence();
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.presenceTimer = setTimeout(() => this.prunePresence(), RULES.presenceTimeoutMs + 200);
  }

  private prunePresence(): void {
    const channel = this.channel;
    const present = new Set(channel ? Object.values(this.presence(channel)).map((e) => e[0]?.userId) : []);
    const cutoff = Date.now() - RULES.presenceTimeoutMs;
    let changed = false;
    for (const [id, entry] of this.seen) {
      if (present.has(id)) entry.at = Date.now();
      else if (entry.at < cutoff) {
        this.seen.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPresence();
    if (this.seen.size > present.size) {
      this.presenceTimer = setTimeout(() => this.prunePresence(), 1_000);
    }
  }

  private onKicked(until: IsoTime | null): void {
    if (!this.me) return;
    this.me = null;
    this.stopHeartbeat();
    void this.teardownChannel();
    this.emitter.emit('me:kicked', { until });
  }

  private onNicknameLost(): void {
    if (!this.me) return;
    const nickname = this.me.nickname;
    this.me = null;
    this.stopHeartbeat();
    void this.teardownChannel();
    this.emitter.emit('me:nickname_lost', { nickname });
  }

  /* ================= 小工具 ================= */

  private toMessage(json: MessageJson): ChatMessage {
    return toChatMessage(json, (path) => this.supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  private async removeImage(path: string): Promise<void> {
    try {
      await this.supabase.storage.from(BUCKET).remove([path]);
    } catch {
      /* 刪不掉的圖片會由每天的清理處理 */
    }
  }

  private presence(channel: RealtimeChannel): Record<string, PresencePayload[]> {
    return channel.presenceState() as unknown as Record<string, PresencePayload[]>;
  }

  private channelJoined(): boolean {
    return (this.channel as unknown as { state?: string } | null)?.state === 'joined';
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit('connection:status', status);
  }

  private meAsOnlineUser(): OnlineUser {
    return { userId: this.me?.userId ?? '', nickname: this.me?.nickname ?? '', isAdmin: this.me?.isAdmin ?? false, isMe: true };
  }

  private onlineUsers(): OnlineUser[] {
    const myId = this.me?.userId;
    const others: OnlineUser[] = [...this.seen.values()]
      .filter((e) => e.user.userId !== myId)
      .map((e) => ({ ...e.user, isMe: false }));
    const all = this.me ? [this.meAsOnlineUser(), ...others] : others;
    // 管理員排最前面，再來是自己
    return all.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || Number(b.isMe) - Number(a.isMe));
  }

  private emitPresence(): void {
    this.emitter.emit('presence:sync', this.onlineUsers());
  }
}
