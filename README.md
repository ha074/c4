# 匿名聊天室

不用註冊、不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊用 Supabase（階段二）。

- 需求：[`docs/requirements.md`](docs/requirements.md)
- 架構：[`docs/architecture.md`](docs/architecture.md)
- 畫面設計：[`docs/design.md`](docs/design.md)

目前在**階段一**：只有前端，使用示範版通訊層（同一個瀏覽器的分頁之間互傳訊息）。

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

## 程式放在哪裡

```
src/chat/            通訊層（插座）：畫面層只能透過 ChatService.ts 跟它溝通
src/chat/mock/       階段一：示範版
src/chat/supabase/   階段二：正式版（整個專案唯一可以使用 Supabase 的地方）
src/screens/         整頁畫面：進入、聊天室、管理員登入、被踢出
src/components/      畫面零件
src/lib/             共用小工具：檢查代號、網址轉連結、圖片壓縮、通知…
src/styles/          樣式（tokens.css 是 design.md 的設計基礎）
tests/               自動測試
```

## 部署

push 到 `main` 後，GitHub Actions 會自動測試、打包、發布到 GitHub Pages（`.github/workflows/deploy.yml`）。
第一次要到 repo 的 **Settings → Pages → Source** 選 **GitHub Actions**。
