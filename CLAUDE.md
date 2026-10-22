# CLAUDE.md

不用註冊、不用登入的匿名聊天室：前端放在 GitHub Pages，即時傳訊用 Supabase。

## 開始任何工作前

先讀 `docs/architecture.md`。需求原文在 `docs/requirements.md`。

## 目前進度

目前在**階段二**（接上 Supabase），進行中：

- 已完成：正式版通訊層 `src/chat/supabase/`、資料庫（`supabase/migrations/0001_chat.sql` 已在後台執行）、Realtime 只允許私人頻道、GitHub Variables。正式網站不提供示範模式。
- 還沒做：建立管理員帳號（要使用者自己設密碼）、Web Push 和兩個 Edge Function。
- 步驟見 `README.md` 的「接上 Supabase」；完成標準見 `docs/architecture.md` 第 13.2 節。
- 不使用 Supabase CLI：SQL 一律貼到後台 SQL Editor 執行。

## 金鑰規則

- **不可以把金鑰檔案 commit 進 git**，包括 `.env`、`.env.*`（`.env.example` 除外）、`supabase/functions/.env`、`supabase/.temp/`。
- `.env.example` 只寫變數名稱，不寫值。
- Secret key（`sb_secret_…`）、VAPID 私鑰、`INTERNAL_FUNCTION_SECRET` 永遠不能出現在網頁程式碼或 repo 裡。詳見 `docs/architecture.md` 第 8 節。
