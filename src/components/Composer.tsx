import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { ChatService } from '../chat/ChatService';
import { RULES } from '../chat/rules';
import type { OnlineUser, PreparedImage } from '../chat/types';
import { imageProblemText } from '../lib/errorText';
import { firstFile, prepareImage } from '../lib/image';
import { extractMentions } from '../lib/linkify';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface ComposerSend {
  text: string;
  mentions: string[];
  image: PreparedImage | null;
  previewUrl: string | null;
}

interface ComposerProps {
  online: OnlineUser[];
  /** 斷線中：可以打字，但不能送出 */
  paused: boolean;
  /** 洗版限制中 */
  cooldown: boolean;
  editing: { id: string; text: string } | null;
  /** 從線上名單點名字：在輸入框插入 @代號（nonce 讓同一個名字可以連點） */
  insertRequest: { nickname: string; nonce: number } | null;
  /** 拖曳到聊天區的檔案 */
  droppedFile: { file: File; nonce: number } | null;
  isTouch: boolean;
  devTools?: ChatService['devTools'];
  onSend(input: ComposerSend): void;
  onSaveEdit(text: string): void;
  onCancelEdit(): void;
  onToast(text: string): void;
}

interface PickerState {
  start: number;
  query: string;
}

const textLength = (s: string) => [...s].length;

export function Composer({
  online,
  paused,
  cooldown,
  editing,
  insertRequest,
  droppedFile,
  isTouch,
  devTools,
  onSend,
  onSaveEdit,
  onCancelEdit,
  onToast,
}: ComposerProps) {
  const inputId = useId();
  const pickerId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ prepared: PreparedImage; previewUrl: string } | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [active, setActive] = useState(0);
  const [offline, setOffline] = useState(() => devTools?.isSimulatedOffline() ?? false);
  const draftBeforeEdit = useRef('');

  const others = online.filter((u) => !u.isMe);
  const candidates = picker
    ? others.filter((u) => u.nickname.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 8)
    : [];
  const pickerOpen = picker !== null && candidates.length > 0;

  const length = textLength(text);
  const remaining = RULES.messageMax - length;
  const over = remaining < 0;
  const empty = text.trim() === '' && !image;
  const canSend = !empty && !over && !paused && !cooldown;

  // 自動長高（最多 160px）
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // 進入／離開編輯模式
  useEffect(() => {
    if (editing) {
      draftBeforeEdit.current = text;
      setText(editing.text);
      setPicker(null);
      requestAnimationFrame(() => {
        const el = input.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    } else {
      setText(draftBeforeEdit.current);
      draftBeforeEdit.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  useEffect(() => {
    if (!insertRequest) return;
    insertAtCaret(`@${insertRequest.nickname} `);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.nonce]);

  useEffect(() => {
    if (droppedFile) void attach(droppedFile.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFile?.nonce]);

  // 換掉或拿掉圖片時，釋放預覽網址（送出後由聊天室負責釋放）
  const releasePreview = () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
  };

  function insertAtCaret(snippet: string) {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + snippet.length;
      el?.setSelectionRange(caret, caret);
    });
  }

  async function attach(file: File) {
    if (editing) {
      onToast('編輯訊息時不能加圖片');
      return;
    }
    const result = await prepareImage(file);
    if (!result.ok) {
      onToast(imageProblemText(result.problem));
      return;
    }
    releasePreview();
    setImage({ prepared: result.image, previewUrl: URL.createObjectURL(result.image.blob) });
    input.current?.focus();
  }

  function updatePicker(value: string, caret: number) {
    // 找游標前面最近的 @，而且 @ 和游標之間沒有空白
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return setPicker(null);
    const query = before.slice(at + 1);
    if (/\s/.test(query) || query.length > 16) return setPicker(null);
    setPicker({ start: at, query });
    setActive(0);
  }

  function choose(nickname: string) {
    if (!picker) return;
    const el = input.current;
    const caret = el?.selectionStart ?? text.length;
    const insert = `@${nickname} `;
    const next = text.slice(0, picker.start) + insert + text.slice(caret);
    setText(next);
    setPicker(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = picker.start + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function submit() {
    if (editing) {
      if (over || (text.trim() === '' && !editing.text)) return;
      if (paused) return;
      onSaveEdit(text);
      return;
    }
    if (!canSend) return;
    onSend({
      text,
      mentions: extractMentions(text, others.map((u) => u.nickname)),
      image: image?.prepared ?? null,
      previewUrl: image?.previewUrl ?? null,
    });
    setText('');
    setImage(null);
    setPicker(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 中文輸入法選字時按的 Enter 不算數
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (pickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(candidates[Math.min(active, candidates.length - 1)].nickname);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPicker(null);
        return;
      }
    }

    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      onCancelEdit();
      return;
    }

    // 電腦：Enter 送出、Shift+Enter 換行；手機：Enter 換行，用「送出」按鈕送出
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
      e.preventDefault();
      submit();
    }
  }

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    updatePicker(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = firstFile(e.clipboardData?.items);
    if (file) {
      e.preventDefault();
      void attach(file);
    }
  }

  const sendLabel = editing ? '儲存' : '送出';
  const sendDisabled = editing ? over || paused || (text.trim() === '' && !editing.text) : !canSend;

  return (
    <div className="composer">
      {pickerOpen && (
        <ul className="picker" id={pickerId} role="listbox" aria-label="選擇要 @ 的人">
          <li className="picker__title" role="presentation">
            線上的人{picker.query ? ` · 符合「${picker.query}」` : ''}
          </li>
          {candidates.map((u, i) => (
            <li
              key={u.userId}
              role="option"
              id={`${pickerId}-${i}`}
              aria-selected={i === active}
              className="picker__opt"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(u.nickname);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar nickname={u.nickname} isAdmin={u.isAdmin} />
              <span>{u.nickname}</span>
              {u.isAdmin && <span className="badge">管理員</span>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="composer__editbar">
          <span>
            <Icon name="pencil" size="sm" />
            {isTouch ? '正在編輯' : '正在編輯，按 Esc 取消'}
          </span>
          <button type="button" className="icon-btn" style={{ color: 'inherit', fontSize: 13 }} onClick={onCancelEdit}>
            取消
          </button>
        </div>
      )}

      {image && (
        <div className="composer__preview">
          <div className="composer__preview-img">
            <img src={image.previewUrl} alt="要送出的圖片" />
            <button
              type="button"
              className="composer__remove"
              aria-label="拿掉這張圖片"
              onClick={() => {
                releasePreview();
                setImage(null);
                input.current?.focus();
              }}
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
          <span className="composer__preview-note">可以加一段文字一起送</span>
        </div>
      )}

      <div className="composer__row">
        <button
          type="button"
          className="icon-btn"
          aria-label={isTouch ? '加入圖片或拍照' : '加入圖片'}
          disabled={Boolean(editing)}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="image" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void attach(file);
          }}
        />
        <div className="composer__field">
          <label htmlFor={inputId} className="sr-only">
            訊息
          </label>
          <textarea
            id={inputId}
            ref={input}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={isTouch ? '輸入訊息…' : '輸入訊息…（可以直接貼上截圖，或把圖片拖進來）'}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onClick={(e) => updatePicker(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            onBlur={() => setTimeout(() => setPicker(null), 120)}
            enterKeyHint={isTouch ? 'enter' : 'send'}
            aria-autocomplete="list"
            aria-controls={pickerOpen ? pickerId : undefined}
            aria-activedescendant={pickerOpen ? `${pickerId}-${active}` : undefined}
            aria-describedby={remaining <= RULES.messageCounterFrom ? `${inputId}-count` : undefined}
          />
          {remaining <= RULES.messageCounterFrom && (
            <span className="composer__counter" id={`${inputId}-count`} aria-live="polite">
              {over ? `超過 ${-remaining} 字` : `剩 ${remaining} 字`}
            </span>
          )}
        </div>
        <button type="button" className="composer__send" disabled={sendDisabled} onClick={submit}>
          {sendLabel}
        </button>
      </div>

      <div className="composer__hint">
        {paused ? '連線恢復後才能送出' : 'Enter 送出・Shift + Enter 換行・打 @ 選人'}
      </div>

      {devTools && (
        <div className="composer__dev">
          <label className="dev-switch">
            <input
              type="checkbox"
              checked={offline}
              onChange={(e) => {
                setOffline(e.target.checked);
                devTools.setSimulatedOffline(e.target.checked);
              }}
            />
            模擬斷線（開發用）
          </label>
        </div>
      )}
    </div>
  );
}
