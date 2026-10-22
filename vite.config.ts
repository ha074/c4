/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 會把網站放在 https://<帳號>.github.io/<repo 名稱>/ 底下，
// 所以所有檔案路徑都要以 /<repo 名稱>/ 開頭。repo 改名時，這裡要一起改。
const REPO_BASE = '/c4/';

/**
 * 只在 build（要放上 GitHub Pages 的版本）加上 CSP。
 * 開發時 Vite 需要用到 inline script 和 WebSocket 來即時更新畫面，加了會壞掉。
 * 規則：只能連到自己和 Supabase（架構文件 9.1）；字型從 Google Fonts 載入。
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'c4-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
    },
  };
}

export default defineConfig({
  base: REPO_BASE,
  plugins: [react(), contentSecurityPolicy()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
