import { useId, useState, type FormEvent } from 'react';
import type { ChatService } from '../chat/ChatService';
import { RULES } from '../chat/rules';
import type { OnlineUser } from '../chat/types';
import { DemoBanner } from '../components/DemoBanner';
import { Icon } from '../components/Icon';
import { errorText, nicknameProblemText } from '../lib/errorText';
import { checkNickname, nicknameLength } from '../lib/nickname';
import { readJson, UI_KEYS, writeJson } from '../lib/storage';

interface EntryScreenProps {
  service: ChatService;
  /** 從別的畫面帶過來的說明，例如「代號被別人拿走了」 */
  notice: string | null;
  onJoined(me: OnlineUser): void;
}

/** 進入畫面（7.1） */
export function EntryScreen({ service, notice, onJoined }: EntryScreenProps) {
  const inputId = useId();
  const errorId = useId();
  const [savedNickname] = useState(() => readJson<string>(UI_KEYS.lastNickname, ''));
  const [nickname, setNickname] = useState(savedNickname);
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  const length = nicknameLength(nickname);
  const tooLong = length > RULES.nicknameMax;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    // 送出前先檢查格式，不合規則就直接說原因，不送出
    const check = checkNickname(nickname);
    if (!check.ok) {
      setError(nicknameProblemText(check.problem));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await service.join(check.nickname);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.code, result.until));
      return;
    }
    writeJson(UI_KEYS.lastNickname, check.nickname);
    onJoined(result.value);
  }

  return (
    <div className="screen">
      {service.mode === 'demo' && <DemoBanner />}
      <div className="screen__body">
        <div className="screen__head">
          <div className="screen__logo" aria-hidden="true">
            <Icon name="chat" />
          </div>
          <h1 className="screen__title">匿名聊天室</h1>
          <p className="screen__lead">取一個代號就能聊，不用註冊、不用登入。</p>
          {service.isAdmin() && (
            <p className="screen__lead" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <span className="badge">管理員</span>
              {service.mode === 'demo' ? '已用管理員身分登入（示範）' : '已用管理員身分登入'}
            </p>
          )}
        </div>
        <form className="form" onSubmit={submit} noValidate>
          <label className="field__label" htmlFor={inputId}>
            你的代號
          </label>
          <input
            id={inputId}
            className="field__input"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              if (error) setError(null);
            }}
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoFocus={!savedNickname}
          />
          <div className={tooLong ? 'field__hint field__hint--over' : 'field__hint'}>
            <span>{savedNickname && nickname === savedNickname ? '已自動填入上次的代號' : '1～16 個字'}</span>
            <span>
              {length} / {RULES.nicknameMax}
            </span>
          </div>
          {error && (
            <div className="alert" role="alert" id={errorId}>
              <Icon name="alert" size="md" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            className={busy ? 'btn btn--primary btn--busy' : 'btn btn--primary'}
            style={{ marginTop: 6 }}
            disabled={busy || nickname.trim() === ''}
          >
            {busy && <Icon name="spinner" size="md" className="spin" />}
            {busy ? '進入中…' : '進入'}
          </button>
          <p className="form__note">按 Enter 也可以進入</p>
        </form>
      </div>
    </div>
  );
}
