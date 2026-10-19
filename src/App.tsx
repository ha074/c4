import { useEffect, useMemo, useState } from 'react';
import { createChatService } from './chat/createChatService';
import type { IsoTime, OnlineUser } from './chat/types';
import { applyBackground, loadBackground, saveBackground } from './lib/theme';
import { AdminLoginScreen } from './screens/AdminLoginScreen';
import { ChatScreen } from './screens/ChatScreen';
import { EntryScreen } from './screens/EntryScreen';
import { KickedScreen } from './screens/KickedScreen';

type View =
  | { name: 'entry'; notice: string | null }
  | { name: 'chat'; me: OnlineUser }
  | { name: 'kicked'; until: IsoTime | null };

/**
 * 決定現在顯示哪個畫面。不用換頁套件：用「目前狀態」切換，
 * 管理員入口用網址的 #admin（GitHub Pages 遇到 /admin 會 404）。
 */
export function App() {
  const service = useMemo(() => createChatService(), []);
  const [view, setView] = useState<View>({ name: 'entry', notice: null });
  const [hash, setHash] = useState(() => window.location.hash);
  const [background, setBackground] = useState(loadBackground);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    applyBackground(background);
    saveBackground(background);
  }, [background]);

  const goEntry = (notice: string | null = null) => setView({ name: 'entry', notice });

  if (hash === '#admin' && view.name === 'entry') {
    return (
      <AdminLoginScreen
        service={service}
        onDone={() => {
          // 拿掉 #admin，回到進入畫面
          history.replaceState(null, '', window.location.pathname + window.location.search);
          setHash('');
        }}
      />
    );
  }

  switch (view.name) {
    case 'entry':
      return (
        <EntryScreen
          key={view.notice ?? 'entry'}
          service={service}
          notice={view.notice}
          onJoined={(me) => setView({ name: 'chat', me })}
        />
      );
    case 'chat':
      return (
        <ChatScreen
          service={service}
          me={view.me}
          background={background}
          onBackgroundChange={setBackground}
          onLeft={() => goEntry()}
          onKicked={(until) => setView({ name: 'kicked', until })}
          onNicknameLost={(nickname) => goEntry(`你的代號「${nickname}」已經被別人使用，請換一個`)}
        />
      );
    case 'kicked':
      return <KickedScreen until={view.until} onBack={() => goEntry()} />;
  }
}
