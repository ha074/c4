import { RULES } from '../chat/rules';
import type { PreparedImage } from '../chat/types';

export type ImageProblem = 'type' | 'raw_too_large' | 'too_large' | 'unreadable';

export type PrepareResult = { ok: true; image: PreparedImage } | { ok: false; problem: ImageProblem };

/**
 * 送出前在瀏覽器裡處理圖片（架構文件 9.1）：
 * - 只接受 JPEG、PNG、WebP、GIF
 * - 原始檔最大 20 MB
 * - 除了 GIF，都重新壓縮成 WebP、長邊最多 1600 像素；重新壓縮也會去掉 EXIF（拍攝地點等）
 * - GIF 不壓縮（會失去動畫），原檔要在 2 MB 以下
 */
export async function prepareImage(file: Blob): Promise<PrepareResult> {
  if (!RULES.imageTypes.includes(file.type)) return { ok: false, problem: 'type' };
  if (file.size > RULES.imageRawMaxBytes) return { ok: false, problem: 'raw_too_large' };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problem: 'unreadable' };
  }

  if (file.type === 'image/gif') {
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (file.size > RULES.imageMaxBytes) return { ok: false, problem: 'too_large' };
    return { ok: true, image: { blob: file, ...size } };
  }

  const scale = Math.min(1, RULES.imageMaxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { ok: false, problem: 'unreadable' };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // 少數舊瀏覽器不支援輸出 WebP，會給 PNG；只要大小沒問題就接受
    if (blob && blob.size <= RULES.imageMaxBytes) return { ok: true, image: { blob, width, height } };
  }
  return { ok: false, problem: 'too_large' };
}

/** 從貼上或拖曳的資料裡找出第一個檔案 */
export function firstFile(list: FileList | DataTransferItemList | null | undefined): File | null {
  if (!list) return null;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item instanceof File) return item;
    if ('kind' in item && item.kind === 'file') {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
