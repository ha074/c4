# 匿名聊天室

不用註冊、不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊用 Supabase（階段二）。

- 需求：[`docs/requirements.md`](docs/requirements.md)
- 架構：[`docs/architecture.md`](docs/architecture.md)
- 畫面設計：[`docs/design.md`](docs/design.md)

目前在**階段二**：正式版通訊層和資料庫 SQL 已經寫好，Supabase 那邊設定完成前，網站會自動以示範版運作（同一個瀏覽器的分頁之間互傳訊息）。

網站：https://ha074.github.io/c4/

## 在自己電腦上執行

需要 Node.js LTS 版（https://nodejs.org）。

```bash
npm install        # 第一次要先安裝套件（會產生 package-lock.json，請一起 commit）
npm run dev        # 啟動本機預覽，打開畫面上顯示的網址（http://localhost:5173/c4/）
npm test           # 跑自動測試
npm run build      # 打包成要放上 GitHub Pages 的檔案（放在 dist/）
npm run preview    # 預覽打包後的版本
```

## 怎麼測試示範版

| 想看什麼 | 怎麼做 |
|---|---|
| 兩個人聊天 | 同一個瀏覽器開兩個分頁，各取一個代號 |
| 只有一個分頁也想看到別人 | 網址後面加 `?bots`，會有 2 個示範機器人進來說話、@你 |
| 管理員 | 網址後面加 `#admin`，任何 Email 加上密碼 `demo` |
| 斷線的畫面 | 輸入框下方勾「模擬斷線（開發用）」 |

完整的檢查清單在 `docs/architecture.md` 第 13.1 節。

## 接上 Supabase（不用 CLI，全部在網頁後台做）

1. **建資料庫**：Supabase 後台 → **SQL Editor** → New query → 貼上 `supabase/migrations/0001_chat.sql` 全部內容 → **Run**。
   可以重複執行。先前手動建的 `messages` 表會改名成 `messages_legacy_backup` 留著，不會刪掉。
2. **只允許私人頻道**：**Realtime → Settings** → 關掉 **Allow public access**。
3. **匿名登入**：**Authentication → Sign In / Providers → Anonymous** 要是打開的（已經打開）。
4. **管理員**：**Authentication → Users → Add user → Create new user**，填你的 Email 和密碼、勾 Auto Confirm User。
   再到 SQL Editor 執行（Email 換成你的）：
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '你的 Email' on conflict do nothing;
   ```
5. **讓網站改用正式版**：GitHub repo → **Settings → Secrets and variables → Actions → Variables** → New repository variable：
   - `VITE_SUPABASE_URL`：專案網址，例如 `https://xxxx.supabase.co`（後面**不要**加 `/rest/v1/`）
   - `VITE_SUPABASE_PUBLISHABLE_KEY`：Supabase 後台 **Settings → API Keys** 的 Publishable key（`sb_publishable_…`）

   這兩個值本來就會出現在公開的網頁裡，所以放 Variables 不放 Secrets。**Secret key（`sb_secret_…`）絕對不要放。**
6. 到 repo 的 **Actions** 分頁，對最新一筆「Deploy to GitHub Pages」按 **Re-run all jobs**，1～2 分鐘後網站就是正式版。
   網址加 `?demo` 可以隨時強制看示範版。

還沒做的：網頁關掉也收得到的推播（Web Push、VAPID 金鑰、Edge Function `send-push`），以及每天刪 7 天前圖片檔的 Edge Function `cleanup`。
7 天前的訊息由資料庫排程每天自動刪除。

## 程式放在哪裡

```
src/chat/            通訊層（插座）：畫面層只能透過 ChatService.ts 跟它溝通
src/chat/mock/       階段一：示範版
src/chat/supabase/   階段二：正式版（整個專案唯一可以使用 Supabase 的地方）
supabase/migrations/ 階段二：資料庫（貼到 Supabase 後台 SQL Editor 執行）
src/screens/         整頁畫面：進入、聊天室、管理員登入、被踢出
src/components/      畫面零件
src/lib/             共用小工具：檢查代號、網址轉連結、圖片壓縮、通知…
src/styles/          樣式（tokens.css 是 design.md 的設計基礎）
tests/               自動測試
```

## 部署

push 到 `main` 後，GitHub Actions 會自動測試、打包、發布到 GitHub Pages（`.github/workflows/deploy.yml`）。
第一次要到 repo 的 **Settings → Pages → Source** 選 **GitHub Actions**。
