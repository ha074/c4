/**
 * 所有規則數字集中在這裡（架構文件 4.3 第 4 條）。
 * 示範版、正式版、畫面層都用這裡的數字；階段二的資料庫檢查也要用同樣的數字。
 */
export const RULES = {
  /** 代號長度（以「字」計算，不是位元組） */
  nicknameMin: 1,
  nicknameMax: 16,
  /** 冒充系統或管理員的代號（不分大小寫、全半形比對） */
  reservedNicknames: ['管理員', '管理者', '系統', 'admin', 'administrator', 'system', 'moderator', 'mod'],

  /** 一則訊息最多幾個字 */
  messageMax: 500,
  /** 剩幾個字時開始顯示剩餘字數 */
  messageCounterFrom: 50,

  /** 洗版限制：每人每 10 秒最多 5 則 */
  rateWindowMs: 10_000,
  rateMaxMessages: 5,
  /** 每人每分鐘最多 3 張圖片 */
  imageRateWindowMs: 60_000,
  imageRateMax: 3,

  /** 圖片：只接受這些格式（SVG 不在清單裡，因為 SVG 裡可以藏程式） */
  imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as readonly string[],
  /** 原始檔最大 20 MB */
  imageRawMaxBytes: 20 * 1024 * 1024,
  /** 壓縮後（或 GIF 原檔）最大 2 MB */
  imageMaxBytes: 2 * 1024 * 1024,
  /** 壓縮後長邊最多 1600 像素 */
  imageMaxEdge: 1600,

  /** 進入時讀最近幾則 */
  historyLimit: 50,

  /** 多久沒有心跳就從線上名單拿掉 */
  presenceTimeoutMs: 10_000,
  /** 多久沒回來才在聊天紀錄寫「離開了聊天室」 */
  leaveLogAfterMs: 60_000,
  /** 代號保留多久（斷線超過這個時間，代號可能被別人拿走） */
  nicknameHoldMs: 60_000,

  /** 「全部訊息」通知：這段時間內的通知合併成一則 */
  notifyMergeMs: 30_000,

  /** 踢出時間 */
  kickDurationsMs: {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  },
} as const;
