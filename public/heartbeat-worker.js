// 心跳計時器（正式版用）。
// 分頁在背景時，瀏覽器會把網頁裡的 setInterval 放慢到一分鐘一次，
// 心跳就會超過伺服器的 60 秒期限、被當成離開。Worker 裡的計時器不受這個限制，
// 所以由這裡每隔一段時間通知網頁送一次心跳。
let timer = null;

self.onmessage = (event) => {
  const { type, intervalMs } = event.data || {};
  if (timer) clearInterval(timer);
  timer = null;
  if (type === 'start') timer = setInterval(() => self.postMessage('tick'), intervalMs || 20000);
};
