import { useId, useState, type FormEvent } from 'react';
import type { ChatService } from '../chat/ChatService';
import { DemoBanner } from '../components/DemoBanner';
import { Icon } from '../components/Icon';
import { errorText } from '../lib/errorText';

/** 管理員登入（網址#admin，7.6）。登入後回到進入畫面 */
export function AdminLoginScreen({ service, onDone }: { service: ChatService; onDone(): void }) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('請輸入 Email 和密碼');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await service.adminLogin(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    onDone();
  }

  return (
    <div className="screen">
      {service.mode === 'demo' && <DemoBanner />}
      <a className="back-link" href="#" onClick={(e) => (e.preventDefault(), onDone())}>
        <Icon name="back" size="md" />
        回到進入畫面
      </a>
      <div className="screen__body" style={{ paddingTop: 8 }}>
        <div className="screen__head">
          <div className="screen__logo screen__logo--admin" aria-hidden="true">
            <Icon name="shield" />
          </div>
          <h1 className="screen__title screen__title--sm">管理員登入</h1>
          <p className="screen__lead" style={{ fontSize: 15 }}>
            登入後回到進入畫面，進入聊天室時代號旁會有管理員標記。
          </p>
          {service.mode === 'demo' && (
            <p className="screen__lead" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <span className="badge badge--demo">示範</span>
              任何 Email 加上密碼 demo 就能登入
            </p>
          )}
        </div>
        <form className="form" style={{ gap: 16 }} onSubmit={submit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              className="field__input"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={passwordId}>
              密碼
            </label>
            <input
              id={passwordId}
              className="field__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="alert" role="alert">
              <Icon name="alert" size="md" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" className="btn btn--dark" style={{ marginTop: 6 }} disabled={busy}>
            {busy && <Icon name="spinner" size="md" className="spin" />}
            {busy ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
}
