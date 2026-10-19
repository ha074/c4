/** 小型事件發送器，示範版和正式版共用 */
export class Emitter<Events extends object> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => {
      set?.delete(handler as (payload: never) => void);
    };
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        (handler as (p: Events[E]) => void)(payload);
      } catch (err) {
        console.error(`[chat] ${String(event)} handler failed`, err);
      }
    });
  }
}
