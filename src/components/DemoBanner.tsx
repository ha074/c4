import { Icon } from './Icon';

/** 示範模式提示條（架構文件 4.1）：只要是示範版就一直顯示，避免有人以為已經可以正式使用 */
export function DemoBanner({ slim = false }: { slim?: boolean }) {
  return (
    <div className={slim ? 'demo-banner demo-banner--slim' : 'demo-banner'} role="note">
      <Icon name="info" size="md" />
      <div>
        <strong>示範模式</strong>：訊息只在這個瀏覽器的分頁之間傳遞，別人看不到。
      </div>
    </div>
  );
}
