import type { ErrorCode } from '../chat/types';
import type { NicknameProblem } from './nickname';
import type { ImageProblem } from './image';
import { RULES } from '../chat/rules';
import { formatUntil } from './time';

/** 通訊層回傳的錯誤代碼 → 畫面上的中文（架構文件 5.1：畫面層看代碼決定顯示哪一句） */
export function errorText(code: ErrorCode, until?: string | null): string {
  switch (code) {
    case 'nickname_taken':
      return '這個代號有人在用，換一個試試';
    case 'nickname_invalid':
      return '代號不能包含特殊符號';
    case 'banned':
      if (until === null) return '你已被永久請出聊天室，無法再進來';
      return until ? `你被請出聊天室，${formatUntil(until)} 後可以再進來` : '你被請出聊天室，暫時不能再進來';
    case 'rate_limited':
      return '太快了，請稍等幾秒';
    case 'too_long':
      return `訊息最多 ${RULES.messageMax} 字`;
    case 'image_too_large':
      return '圖片太大，請換一張小一點的';
    case 'image_type_not_allowed':
      return '只能傳 JPEG、PNG、WebP、GIF 圖片';
    case 'not_owner':
      return '只能修改或收回自己的訊息';
    case 'message_gone':
      return '這則訊息已經不在了';
    case 'wrong_credentials':
      return 'Email 或密碼不對';
    case 'not_admin':
      return '這個帳號不是管理員';
    case 'permission_denied':
      return '通知被瀏覽器封鎖了';
    case 'unsupported':
      return '這個瀏覽器不支援';
    case 'network':
      return '網路有問題，請稍後再試';
  }
}

/** 送出前在畫面上就能抓到的代號問題，給「看得懂的原因」 */
export function nicknameProblemText(problem: NicknameProblem): string {
  switch (problem) {
    case 'empty':
      return '請輸入代號';
    case 'too_long':
      return `代號最多 ${RULES.nicknameMax} 個字`;
    case 'bad_chars':
      return '代號不能包含特殊符號或看不見的字元，只能用文字、數字、底線、連字號和空格';
    case 'no_letters':
      return '代號至少要有一個文字或數字';
    case 'reserved':
      return '這個代號容易被誤認成管理員或系統，換一個試試';
  }
}

export function imageProblemText(problem: ImageProblem): string {
  switch (problem) {
    case 'type':
      return '只能傳 JPEG、PNG、WebP、GIF 圖片';
    case 'raw_too_large':
      return '圖片太大，原始檔最多 20 MB';
    case 'too_large':
      return '圖片太大，請換一張小一點的';
    case 'unreadable':
      return '這張圖片讀不出來，換一張試試';
  }
}
