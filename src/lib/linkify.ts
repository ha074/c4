/**
 * 把訊息文字切成「純文字／連結／@提及」幾段，交給畫面用 React 元件組出來。
 * 這裡只產生資料，不產生 HTML，所以訊息裡的 <script> 之類的東西永遠只會被當成文字。
 */
export type Segment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'mention'; text: string; nickname: string };

/** 只把 http:// 和 https:// 開頭的變成連結；javascript: 之類的不會 */
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
/** 網址結尾常見、但通常不屬於網址的標點 */
const TRAILING = /[.,!?;:)\]}，。！？；：、）」』】》]+$/u;

export function safeHref(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function splitLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trail = raw.match(TRAILING);
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    const href = safeHref(raw);
    if (!href) continue;
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) });
    out.push({ type: 'link', text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

function splitMentions(text: string, mentions: readonly string[]): Segment[] {
  if (mentions.length === 0 || !text.includes('@')) return [{ type: 'text', text }];
  // 長的代號先比對，避免「@小明明」被當成「@小明」
  const names = [...new Set(mentions)].sort((a, b) => b.length - a.length);
  const out: Segment[] = [];
  let buffer = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const name = names.find((n) => text.startsWith(n, i + 1));
      if (name) {
        if (buffer) out.push({ type: 'text', text: buffer });
        buffer = '';
        out.push({ type: 'mention', text: `@${name}`, nickname: name });
        i += name.length + 1;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  if (buffer) out.push({ type: 'text', text: buffer });
  return out;
}

export function segmentMessage(text: string, mentions: readonly string[] = []): Segment[] {
  return splitLinks(text).flatMap((seg) =>
    seg.type === 'text' ? splitMentions(seg.text, mentions) : [seg],
  );
}

/** 從文字裡找出 @ 了哪些人（只認目前線上名單裡有的代號） */
export function extractMentions(text: string, onlineNicknames: readonly string[]): string[] {
  const found = new Set<string>();
  const names = [...onlineNicknames].sort((a, b) => b.length - a.length);
  for (let i = text.indexOf('@'); i !== -1; i = text.indexOf('@', i + 1)) {
    const name = names.find((n) => text.startsWith(n, i + 1));
    if (name) found.add(name);
  }
  return [...found];
}
