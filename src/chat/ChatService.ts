/**
 * 「插座的形狀」：畫面層能叫通訊層做的事（架構文件 5.1）。
 *
 * 規則：畫面層只能透過這個介面和通訊層溝通，不可以直接使用 Supabase。
 * 階段一由 mock/MockChatService 實作；階段二由 supabase/SupabaseChatService 實作。
 */
import type {
  AdminError,
  AdminLoginError,
  ChatEventName,
  ChatEvents,
  ChatMessage,
  ConnectionStatus,
  EditError,
  Id,
  JoinError,
  KickDuration,
  NetworkError,
  NotifyMode,
  OnlineUser,
  PushError,
  RecallError,
  Result,
  SendError,
  SendInput,
} from './types';

export interface ChatService {
  /** demo＝示範版（畫面要顯示示範模式提示條）；live＝正式版 */
  readonly mode: 'demo' | 'live';

  join(nickname: string): Promise<Result<OnlineUser, JoinError>>;
  leave(): Promise<void>;
  /** 由舊到新 */
  loadRecent(limit?: number): Promise<ChatMessage[]>;
  sendMessage(input: SendInput): Promise<Result<ChatMessage, SendError>>;
  editMessage(id: Id, text: string): Promise<Result<ChatMessage, EditError>>;
  recallMessage(id: Id): Promise<Result<ChatMessage, RecallError>>;

  adminLogin(email: string, password: string): Promise<Result<void, AdminLoginError>>;
  adminRemoveMessage(id: Id): Promise<Result<ChatMessage, AdminError>>;
  adminKick(userId: Id, duration: KickDuration): Promise<Result<void, AdminError>>;
  /** 這個瀏覽器是否以管理員身分登入 */
  isAdmin(): boolean;

  setNotifyMode(mode: NotifyMode): Promise<Result<void, NetworkError>>;
  getNotifyMode(): NotifyMode;
  /** 網頁關掉也能收到的推播（階段二）。示範版一律回傳 unsupported。 */
  enablePush(): Promise<Result<void, PushError>>;

  getConnectionStatus(): ConnectionStatus;
  /** 目前的線上名單（畫面剛打開時用；之後的變化看 presence:sync 事件） */
  getOnlineUsers(): OnlineUser[];
  /** 訂閱事件；回傳的函式用來取消訂閱 */
  on<E extends ChatEventName>(event: E, handler: (payload: ChatEvents[E]) => void): () => void;

  /** 只有示範版有：開發用的「模擬斷線」開關（架構文件 4.1） */
  readonly devTools?: {
    setSimulatedOffline(offline: boolean): void;
    isSimulatedOffline(): boolean;
  };
}
