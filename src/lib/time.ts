const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const pad = (n: number) => String(n).padStart(2, '0');

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 今天的只顯示「14:30」，更早的加上日期「10/17 23:12」 */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return hm;
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? `${date} ${hm}` : `${d.getFullYear()}/${date} ${hm}`;
}

/** 日期分隔線：「今天」或「10月17日 星期六」 */
export function formatDateSeparator(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return '今天';
  const label = `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`;
  return d.getFullYear() === now.getFullYear() ? label : `${d.getFullYear()}年${label}`;
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 被踢出畫面用：「今天 20:45」「明天 09:00」「10月25日 20:45」 */
export function formatUntil(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return `今天 ${hm}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, tomorrow)) return `明天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 「大約 59 分鐘後」「大約 3 小時後」「大約 6 天後」 */
export function formatRemaining(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 60_000) return '不到 1 分鐘後';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `大約 ${min} 分鐘後`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `大約 ${hr} 小時後`;
  return `大約 ${Math.round(hr / 24)} 天後`;
}
