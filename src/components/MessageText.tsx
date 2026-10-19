import { segmentMessage } from '../lib/linkify';

/**
 * 訊息文字：網址變成連結、@代號 特別標出。
 * 全部用 React 元件組出來，不使用 dangerouslySetInnerHTML（架構文件 9.1：全專案禁止）。
 */
export function MessageText({ text, mentions }: { text: string; mentions: readonly string[] }) {
  return (
    <>
      {segmentMessage(text, mentions).map((seg, i) => {
        if (seg.type === 'link') {
          return (
            <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer nofollow">
              {seg.text}
            </a>
          );
        }
        if (seg.type === 'mention') {
          return (
            <span key={i} className="mention">
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}
