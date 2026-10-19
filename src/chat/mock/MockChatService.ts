/**
 * 階段一：示範版通訊層（架構文件 4.1）。
 *
 * - 每個分頁算一個人；同一個瀏覽器的分頁之間用 BroadcastChannel 互傳訊息。
 * - 最近 50 則訊息存在 localStorage，所有分頁共用；圖片只存在記憶體裡。
 * - 每一個動作、每一種錯誤都照通訊約定做出來（4.3 第 3 條），畫面層才會把錯誤處理好。
 */
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
  type SystemMessage,
  type SystemType,
  type UserMessage,
} from '../types';
import { checkNickname, nicknameKey } from '../../lib/nickname';
import { extractMentions } from '../../lib/linkify';
import { readJson, safeLocal, safeSession, writeJson } from '../../lib/storage';
import { CHANNEL_NAME, DEMO_KEYS, type BanTable, type DemoSession, type Packet } from './protocol';
import { DemoBots } from './bots';
import { uuid } from '../uuid';

interface Peer {
  nickname: string;
  isAdmin: boolean;
  bot: boolean;
  lastSeen: number;
}

const HEARTBEAT_MS = 2_000;
const SWEEP_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** 模擬網路延遲，讓「傳送中」「進入中…」看得到 */
const latency = (min = 120, max = 380) => sleep(min + Math.random() * (max - min));

const textLength = (text: string) => [...text].length;

export interface MockOptions {
  /** 網址有 ?bots：加入 2 個示範機器人 */
  bots?: boolean;
}

export class MockChatService implements ChatService {
  readonly mode = 'demo' as const;
  readonly devTools = {
    setSimulatedOffline: (offline: boolean) => void this.setSimulatedOffline(offline),
    isSimulatedOffline: () => this.offline,
  };

  private readonly emitter = new Emitter<ChatEvents>();
  private readonly channel: BroadcastChannel | null;
  private readonly local = safeLocal();
  private readonly session = safeSession();
  private readonly userId: Id;
  private admin: boolean;
  private me: { nickname: string; key: string } | null = null;
  private status: ConnectionStatus = 'connecting';
  private offline = false;

  /** 其他分頁和機器人 */
  private readonly peers = new Map<Id, Peer>();
  /** 已經從名單拿掉、但還沒寫「離開了聊天室」的人（代號在這段時間內仍然保留） */
  private readonly departed = new Map<Id, { nickname: string; at: number }>();
  /** 這個分頁已經交給畫面的訊息（重連時用來補漏掉的訊息） */
  private readonly known = new Map<Id, ChatMessage>();
  /** 圖片只存在記憶體：訊息 ID → blob: 網址 */
  private readonly imageUrls = new Map<Id, string>();
  private sentAt: number[] = [];
  private imagesSentAt: number[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly bots: DemoBots | null;

  constructor(options: MockOptions = {}) {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.channel?.addEventListener('message', (e: MessageEvent<Packet>) => this.onPacket(e.data));

    this.userId = this.session?.getItem(DEMO_KEYS.userId) ?? uuid();
    this.session?.setItem(DEMO_KEYS.userId, this.userId);
    this.admin = this.session?.getItem(DEMO_KEYS.admin) === '1';

    setInterval(() => this.sweep(), SWEEP_MS);
    this.post({ t: 'ping' });
    setTimeout(() => this.setStatus('online'), 300);

    this.bots = options.bots
      ? new DemoBots({
          post: (packet) => {
            this.post(packet);
            this.onPacket(packet);
          },
          writeMessage: (message) => this.storeAndBroadcastFromBot(message),
          myNickname: () => this.me?.nickname ?? null,
          takenKeys: () => this.takenKeys(),
          isBanned: (id) => this.activeBan(id) !== undefined,
        })
      : null;
  }

  /* ================= 動作（5.1） ================= */

  async join(raw: string): Promise<Result<OnlineUser, JoinError>> {
    await latency(300, 600);
    if (this.offline) return fail('network');

    const check = checkNickname(raw);
    if (!check.ok) return fail('nickname_invalid');

    const ban = this.activeBan(this.userId);
    if (ban !== undefined) return fail('banned', ban);

    // 問一次「誰在線上」，等其他分頁回心跳
    this.post({ t: 'ping' });
    await sleep(300);
    if (this.takenKeys().has(check.key)) return fail('nickname_taken');

    // 剛重新整理、而且代號一樣：直接成功，不再寫一次「進入了聊天室」
    const previous = readJson<DemoSession | null>(DEMO_KEYS.session, null, this.session);
    const silent =
      previous !== null && previous.key === check.key && Date.now() - previous.lastSeen < RULES.nicknameHoldMs;

    this.me = { nickname: check.nickname, key: check.key };
    this.startHeartbeat();
    if (!silent) this.writeSystem('join', check.nickname);
    this.emitPresence();
    this.bots?.start();
    return ok(this.meAsOnlineUser());
  }

  async leave(): Promise<void> {
    if (!this.me) return;
    const nickname = this.me.nickname;
    this.post({ t: 'leave', userId: this.userId });
    this.stopHeartbeat();
    this.me = null;
    this.session?.removeItem(DEMO_KEYS.session);
    this.writeSystem('leave', nickname);
    this.emitPresence();
    this.bots?.stop();
  }

  async loadRecent(limit: number = RULES.historyLimit): Promise<ChatMessage[]> {
    await latency(80, 200);
    const list = this.readMessages().slice(-limit);
    for (const m of list) this.known.set(m.id, m);
    return list.map((m) => this.hydrate(m));
  }

  /** 送出的訊息照按下的順序處理（跟伺服器一樣，先送的先寫入） */
  private sendQueue: Promise<unknown> = Promise.resolve();

  sendMessage(input: SendInput): Promise<Result<ChatMessage, SendError>> {
    const run = this.sendQueue.then(() => this.sendNow(input));
    this.sendQueue = run.catch(() => undefined);
    return run;
  }

  private async sendNow(input: SendInput): Promise<Result<ChatMessage, SendError>> {
    await latency(60, 200);
    if (this.offline || !this.me) return fail('network');
    const ban = this.activeBan(this.userId);
    if (ban !== undefined) return fail('banned', ban);
    if (textLength(input.text) > RULES.messageMax) return fail('too_long');
    if (!input.text.trim() && !input.image) return fail('too_long');

    const now = Date.now();
    this.sentAt = this.sentAt.filter((t) => now - t < RULES.rateWindowMs);
    if (this.sentAt.length >= RULES.rateMaxMessages) return fail('rate_limited');
    if (input.image) {
      this.imagesSentAt = this.imagesSentAt.filter((t) => now - t < RULES.imageRateWindowMs);
      if (this.imagesSentAt.length >= RULES.imageRateMax) return fail('rate_limited');
      if (!RULES.imageTypes.includes(input.image.blob.type)) return fail('image_type_not_allowed');
      if (input.image.blob.size > RULES.imageMaxBytes) return fail('image_too_large');
    }
    this.sentAt.push(now);
    if (input.image) this.imagesSentAt.push(now);

    const message: UserMessage = {
      id: uuid(),
      kind: 'user',
      createdAt: new Date(now).toISOString(),
      authorId: this.userId,
      nickname: this.me.nickname, // 跟正式版一樣：代號由通訊層填入，不採用畫面傳來的值
      isAdmin: this.admin,
      text: input.text,
      image: input.image ? { url: '', width: input.image.width, height: input.image.height } : null,
      mentions: input.mentions,
      editedAt: null,
      status: 'normal',
    };
    if (input.image) this.imageUrls.set(message.id, URL.createObjectURL(input.image.blob));
    this.appendStored(message);
    this.known.set(message.id, message);
    this.post({ t: 'msg', message, blob: input.image?.blob });
    const hydrated = this.hydrate(message);
    this.emitter.emit('message:new', hydrated);
    return ok(hydrated);
  }

  async editMessage(id: Id, text: string): Promise<Result<ChatMessage, EditError>> {
    await latency();
    if (this.offline) return fail('network');
    const target = this.findStored(id);
    if (!target) return fail('message_gone');
    if (target.authorId !== this.userId) return fail('not_owner');
    if (textLength(text) > RULES.messageMax) return fail('too_long');
    if (!text.trim() && !target.image) return fail('too_long');
    const updated: UserMessage = {
      ...target,
      text,
      mentions: extractMentions(text, this.onlineUsers().map((u) => u.nickname)),
      editedAt: new Date().toISOString(),
    };
    return ok(this.commitUpdate(updated));
  }

  async recallMessage(id: Id): Promise<Result<ChatMessage, RecallError>> {
    await latency();
    if (this.offline) return fail('network');
    const target = this.findStored(id);
    if (!target) return fail('message_gone');
    if (target.authorId !== this.userId) return fail('not_owner');
    return ok(this.commitUpdate({ ...target, status: 'recalled', text: '', image: null, mentions: [] }));
  }

  async adminLogin(email: string, password: string): Promise<Result<void, AdminLoginError>> {
    await latency(400, 700);
    if (this.offline) return fail('network');
    // 示範版：任何 Email 加上密碼 demo 就能登入。
    // 為了讓畫面也處理到 not_admin，Email 以 notadmin 開頭時回傳「不是管理員」。
    if (password !== 'demo') return fail('wrong_credentials');
    if (email.trim().toLowerCase().startsWith('notadmin')) return fail('not_admin');
    this.admin = true;
    this.session?.setItem(DEMO_KEYS.admin, '1');
    return ok(undefined);
  }

  async adminRemoveMessage(id: Id): Promise<Result<ChatMessage, AdminError>> {
    await latency();
    if (!this.admin) return fail('not_admin');
    if (this.offline) return fail('network');
    const target = this.findStored(id);
    if (!target) return fail('message_gone');
    return ok(this.commitUpdate({ ...target, status: 'removed', text: '', image: null, mentions: [] }));
  }

  async adminKick(userId: Id, duration: KickDuration): Promise<Result<void, AdminError>> {
    await latency();
    if (!this.admin) return fail('not_admin');
    if (this.offline) return fail('network');
    const until = duration === 'forever' ? null : new Date(Date.now() + RULES.kickDurationsMs[duration]).toISOString();
    const bans = readJson<BanTable>(DEMO_KEYS.bans, {}, this.local);
    bans[userId] = { until };
    writeJson(DEMO_KEYS.bans, bans, this.local);

    const nickname = this.peers.get(userId)?.nickname ?? this.departed.get(userId)?.nickname;
    this.peers.delete(userId);
    this.departed.delete(userId);
    if (nickname) this.writeSystem('kicked', nickname);
    this.post({ t: 'kick', userId, until });
    this.bots?.kicked(userId);
    this.emitPresence();
    return ok(undefined);
  }

  isAdmin(): boolean {
    return this.admin;
  }

  async setNotifyMode(mode: NotifyMode): Promise<Result<void, NetworkError>> {
    writeJson(DEMO_KEYS.notifyMode, mode, this.local);
    return ok(undefined);
  }

  getNotifyMode(): NotifyMode {
    return readJson<NotifyMode>(DEMO_KEYS.notifyMode, 'mentions', this.local);
  }

  async enablePush(): Promise<Result<void, PushError>> {
    await latency();
    // 網頁關掉後的推播需要 Service Worker 和伺服器，要等階段二
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

  /* ================= 收到其他分頁的封包 ================= */

  private onPacket(p: Packet): void {
    if (this.offline) return; // 模擬斷線時什麼都收不到
    switch (p.t) {
      case 'ping':
        if (this.me) this.sendHeartbeat();
        break;
      case 'hb': {
        if (p.userId === this.userId) break;
        if (this.activeBan(p.userId) !== undefined) break;
        const before = this.peers.get(p.userId);
        this.peers.set(p.userId, { nickname: p.nickname, isAdmin: p.isAdmin, bot: !!p.bot, lastSeen: Date.now() });
        this.departed.delete(p.userId);
        if (!before || before.nickname !== p.nickname || before.isAdmin !== p.isAdmin) this.emitPresence();
        break;
      }
      case 'leave':
        this.peers.delete(p.userId);
        this.departed.delete(p.userId);
        this.emitPresence();
        break;
      case 'msg':
        if (this.known.has(p.message.id)) break;
        if (p.blob) this.imageUrls.set(p.message.id, URL.createObjectURL(p.blob));
        this.known.set(p.message.id, p.message);
        this.emitter.emit('message:new', this.hydrate(p.message));
        break;
      case 'upd':
        if (p.message.kind === 'user' && p.message.status !== 'normal') this.dropImage(p.message.id);
        this.known.set(p.message.id, p.message);
        this.emitter.emit('message:updated', this.hydrate(p.message));
        break;
      case 'kick':
        if (p.userId === this.userId && this.me) {
          this.stopHeartbeat();
          this.me = null;
          this.session?.removeItem(DEMO_KEYS.session);
          this.bots?.stop();
          this.emitter.emit('me:kicked', { until: p.until });
        } else {
          this.peers.delete(p.userId);
          this.departed.delete(p.userId);
          this.bots?.kicked(p.userId);
          this.emitPresence();
        }
        break;
    }
  }

  /* ================= 模擬斷線（開發用開關） ================= */

  private async setSimulatedOffline(offline: boolean): Promise<void> {
    if (offline === this.offline) return;
    if (offline) {
      this.offline = true;
      this.setStatus('reconnecting');
      return;
    }
    this.setStatus('connecting');
    await sleep(700);
    this.offline = false;
    this.peers.clear();
    this.post({ t: 'ping' });
    await sleep(400);

    // 斷線太久、代號被別人拿走了
    if (this.me && this.takenKeys().has(this.me.key)) {
      const nickname = this.me.nickname;
      this.stopHeartbeat();
      this.me = null;
      this.session?.removeItem(DEMO_KEYS.session);
      this.emitter.emit('me:nickname_lost', { nickname });
    } else if (this.me) {
      this.sendHeartbeat();
    }

    // 補上斷線期間漏掉的訊息
    for (const m of this.readMessages()) {
      const seen = this.known.get(m.id);
      this.known.set(m.id, m);
      if (!seen) this.emitter.emit('message:new', this.hydrate(m));
      else if (JSON.stringify(seen) !== JSON.stringify(m)) this.emitter.emit('message:updated', this.hydrate(m));
    }
    this.setStatus('online');
    this.emitPresence();
  }

  /* ================= 內部小工具 ================= */

  private post(packet: Packet): void {
    if (this.offline) return;
    try {
      this.channel?.postMessage(packet);
    } catch (err) {
      console.warn('[demo] BroadcastChannel postMessage failed', err);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit('connection:status', status);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    if (!this.me || this.offline) return;
    this.post({ t: 'hb', userId: this.userId, nickname: this.me.nickname, isAdmin: this.admin });
    writeJson(DEMO_KEYS.session, { key: this.me.key, lastSeen: Date.now() } satisfies DemoSession, this.session);
  }

  /** 每秒檢查一次：沒心跳的人拿出名單；拿出名單超過一段時間的人寫「離開了聊天室」 */
  private sweep(): void {
    if (this.offline) return;
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > RULES.presenceTimeoutMs) {
        this.peers.delete(id);
        this.departed.set(id, { nickname: peer.nickname, at: peer.lastSeen });
        changed = true;
      }
    }
    for (const [id, gone] of this.departed) {
      if (now - gone.at > RULES.leaveLogAfterMs) {
        this.departed.delete(id);
        // 只讓一個分頁寫，避免每個分頁都寫一次
        if (this.isLeader()) this.writeSystem('leave', gone.nickname);
      }
    }
    if (changed) this.emitPresence();
  }

  /** 在線的真人分頁中，ID 最小的那個負責寫「離開了聊天室」 */
  private isLeader(): boolean {
    if (!this.me) return false;
    for (const [id, peer] of this.peers) if (!peer.bot && id < this.userId) return false;
    return true;
  }

  /** 目前被佔用的代號（在線的人＋剛離開、代號還保留中的人） */
  private takenKeys(): Set<string> {
    const keys = new Set<string>();
    for (const p of this.peers.values()) keys.add(nicknameKey(p.nickname));
    for (const d of this.departed.values()) keys.add(nicknameKey(d.nickname));
    return keys;
  }

  /** undefined＝沒被封鎖；null＝永久；字串＝到什麼時候 */
  private activeBan(userId: Id): string | null | undefined {
    const ban = readJson<BanTable>(DEMO_KEYS.bans, {}, this.local)[userId];
    if (!ban) return undefined;
    if (ban.until === null) return null;
    return Date.parse(ban.until) > Date.now() ? ban.until : undefined;
  }

  private meAsOnlineUser(): OnlineUser {
    return { userId: this.userId, nickname: this.me?.nickname ?? '', isAdmin: this.admin, isMe: true };
  }

  private onlineUsers(): OnlineUser[] {
    const others = [...this.peers.entries()].map(([userId, p]) => ({
      userId,
      nickname: p.nickname,
      isAdmin: p.isAdmin,
      isMe: false,
    }));
    const all = this.me ? [this.meAsOnlineUser(), ...others] : others;
    // 管理員排最前面，再來是自己
    return all.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || Number(b.isMe) - Number(a.isMe));
  }

  private emitPresence(): void {
    this.emitter.emit('presence:sync', this.onlineUsers());
  }

  private readMessages(): ChatMessage[] {
    return readJson<ChatMessage[]>(DEMO_KEYS.messages, [], this.local);
  }

  private appendStored(message: ChatMessage): void {
    const list = this.readMessages();
    list.push(message);
    writeJson(DEMO_KEYS.messages, list.slice(-RULES.historyLimit), this.local);
  }

  private findStored(id: Id): UserMessage | null {
    const m = this.readMessages().find((x) => x.id === id);
    return m && m.kind === 'user' && m.status === 'normal' ? m : null;
  }

  private commitUpdate(updated: UserMessage): ChatMessage {
    const list = this.readMessages().map((m) => (m.id === updated.id ? updated : m));
    writeJson(DEMO_KEYS.messages, list, this.local);
    if (updated.status !== 'normal') this.dropImage(updated.id);
    this.known.set(updated.id, updated);
    this.post({ t: 'upd', message: updated });
    const hydrated = this.hydrate(updated);
    this.emitter.emit('message:updated', hydrated);
    return hydrated;
  }

  private writeSystem(systemType: SystemType, nickname: string): void {
    const message: SystemMessage = {
      id: uuid(),
      kind: 'system',
      createdAt: new Date().toISOString(),
      systemType,
      nickname,
    };
    this.appendStored(message);
    this.known.set(message.id, message);
    this.post({ t: 'msg', message });
    this.emitter.emit('message:new', message);
  }

  private storeAndBroadcastFromBot(message: ChatMessage): void {
    this.appendStored(message);
    this.post({ t: 'msg', message });
    this.onPacket({ t: 'msg', message });
  }

  /** 把記憶體裡的圖片網址放回訊息；拿不到的圖片 url 是空字串 */
  private hydrate(m: ChatMessage): ChatMessage {
    if (m.kind !== 'user' || !m.image) return m;
    return { ...m, image: { ...m.image, url: this.imageUrls.get(m.id) ?? '' } };
  }

  private dropImage(id: Id): void {
    const url = this.imageUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.imageUrls.delete(id);
  }
}
