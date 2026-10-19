/**
 * 網址加 ?bots 時出現的 2 個示範機器人：偶爾進來、說話、@你、離開（架構文件 4.1）。
 * 只用一支手機也能看到完整效果。機器人的訊息會寫進 localStorage，其他分頁也看得到。
 */
import { RULES } from '../rules';
import type { ChatMessage, Id, SystemType } from '../types';
import { nicknameKey } from '../../lib/nickname';
import type { Packet } from './protocol';
import { uuid } from '../uuid';

interface BotHooks {
  post(packet: Packet): void;
  writeMessage(message: ChatMessage): void;
  myNickname(): string | null;
  takenKeys(): Set<string>;
  isBanned(id: Id): boolean;
}

interface Bot {
  id: Id;
  baseName: string;
  nickname: string;
  online: boolean;
  kicked: boolean;
}

const LINES = [
  '大家好～',
  '今天天氣好好，適合出去走走',
  '有人在嗎？',
  '我剛找到一個不錯的網站 https://example.com 可以看看',
  '我先去吃個飯，等等回來',
  '有人看到昨天的流星雨嗎',
  '這個聊天室的紫色好舒服',
  '晚點有人要一起打遊戲嗎',
  '剛剛差點睡著',
  '推薦一首歌給大家，聽完心情會變好',
];
const MENTION_LINES = ['@{me} 你好！第一次來嗎？', '@{me} 你覺得呢？', '@{me} 還在嗎？', '@{me} 要不要一起？'];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export class DemoBots {
  private readonly bots: Bot[] = [
    { id: uuid(), baseName: '機器人阿橘', nickname: '', online: false, kicked: false },
    { id: uuid(), baseName: '機器人小藍', nickname: '', online: false, kicked: false },
  ];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly hooks: BotHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.heartbeat = setInterval(() => this.beat(), 2_000);
    this.later(1_500, () => this.join(this.bots[0]));
    this.later(3_500, () => this.say(this.bots[0], '大家好～'));
    this.later(6_500, () => this.join(this.bots[1]));
    this.later(9_000, () => this.say(this.bots[1], this.mentionLine()));
    this.later(14_000, () => this.loop());
  }

  stop(): void {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const bot of this.bots) {
      if (bot.online) this.hooks.post({ t: 'leave', userId: bot.id });
      bot.online = false;
    }
  }

  kicked(userId: Id): void {
    const bot = this.bots.find((b) => b.id === userId);
    if (!bot) return;
    bot.online = false;
    bot.kicked = true;
  }

  private loop(): void {
    if (!this.running) return;
    const online = this.bots.filter((b) => b.online);
    const roll = Math.random();
    if (online.length > 0 && roll < 0.15) {
      // 偶爾有一個機器人離開，過一陣子再回來
      const bot = pick(online);
      this.leave(bot);
      this.later(rand(15_000, 25_000), () => this.join(bot));
    } else if (online.length > 0) {
      const bot = pick(online);
      this.say(bot, Math.random() < 0.3 ? this.mentionLine() : pick(LINES));
    }
    this.later(rand(8_000, 15_000), () => this.loop());
  }

  private mentionLine(): string {
    const me = this.hooks.myNickname();
    return me ? pick(MENTION_LINES).replace('{me}', me) : pick(LINES);
  }

  private join(bot: Bot): void {
    if (!this.running || bot.online || bot.kicked || this.hooks.isBanned(bot.id)) return;
    // 名字被真人用掉了就加個數字
    const taken = this.hooks.takenKeys();
    const mine = this.hooks.myNickname();
    if (mine) taken.add(nicknameKey(mine));
    let name = bot.baseName;
    for (let n = 2; taken.has(nicknameKey(name)); n += 1) name = `${bot.baseName}${n}`;
    bot.nickname = name;
    bot.online = true;
    this.hooks.post({ t: 'hb', userId: bot.id, nickname: bot.nickname, isAdmin: false, bot: true });
    this.system('join', bot.nickname);
  }

  private leave(bot: Bot): void {
    if (!bot.online) return;
    bot.online = false;
    this.hooks.post({ t: 'leave', userId: bot.id });
    this.system('leave', bot.nickname);
  }

  private say(bot: Bot, text: string): void {
    if (!this.running || !bot.online) return;
    const me = this.hooks.myNickname();
    const mentions = me && text.includes(`@${me}`) ? [me] : [];
    this.hooks.writeMessage({
      id: uuid(),
      kind: 'user',
      createdAt: new Date().toISOString(),
      authorId: bot.id,
      nickname: bot.nickname,
      isAdmin: false,
      text: [...text].slice(0, RULES.messageMax).join(''),
      image: null,
      mentions,
      editedAt: null,
      status: 'normal',
    });
  }

  private system(systemType: SystemType, nickname: string): void {
    this.hooks.writeMessage({ id: uuid(), kind: 'system', createdAt: new Date().toISOString(), systemType, nickname });
  }

  private beat(): void {
    for (const bot of this.bots) {
      if (bot.online) this.hooks.post({ t: 'hb', userId: bot.id, nickname: bot.nickname, isAdmin: false, bot: true });
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }
}
