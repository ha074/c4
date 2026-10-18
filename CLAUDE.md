# CLAUDE.md

不用註冊、不用登入的匿名聊天室：前端放在 GitHub Pages，即時傳訊用 Supabase。

## 開始任何工作前

先讀 `docs/architecture.md`。需求原文在 `docs/requirements.md`。

## 目前進度

目前在**階段一**：只做前端（示範模式），還沒有接上 Supabase。
階段一的範圍和完成標準見 `docs/architecture.md` 第 4.1 節和第 13.1 節。

## 金鑰規則

- **不可以把金鑰檔案 commit 進 git**，包括 `.env`、`.env.*`（`.env.example` 除外）、`supabase/functions/.env`、`supabase/.temp/`。
- `.env.example` 只寫變數名稱，不寫值。
- Secret key（`sb_secret_…`）、VAPID 私鑰、`INTERNAL_FUNCTION_SECRET` 永遠不能出現在網頁程式碼或 repo 裡。詳見 `docs/architecture.md` 第 8 節。
