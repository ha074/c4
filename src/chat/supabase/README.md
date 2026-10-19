# 正式版通訊層（階段二）

這個資料夾是**整個專案裡唯一可以使用 Supabase 的地方**（架構文件 4.0）。

階段二要在這裡新增 `SupabaseChatService.ts`，實作 `src/chat/ChatService.ts` 定義的每一個動作和事件，
再到 `src/chat/createChatService.ts` 把它接上。畫面層（`src/screens/`、`src/components/`）不用改。

階段一刻意不安裝 `@supabase/supabase-js`。
