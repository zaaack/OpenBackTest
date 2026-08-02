import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Debounced, trade-gated localStorage persistence.
 *
 * Writes are coalesced (debounced 400ms) AND gated behind `armPersist()`.
 * The app arms persistence only after a trade, so high-frequency playback
 * ticks (currentIndex / unrealizedPnL changing every frame) just refresh the
 * in-memory `pending` buffer and never touch localStorage — i.e. no write on
 * every tick. Call `armPersist()` (e.g. when a trade is executed) to flush the
 * latest state of every persisted store.
 *
 * `pending` / `armed` / `timer` are module-level and shared by all stores that
 * use this storage, so a single arm flushes every persisted key and the two
 * stores no longer clobber each other's pending write.
 */

const DEBOUNCE_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending = new Map<string, string>();
let armed = false;

const flush = () => {
  if (pending.size === 0) {
    armed = false;
    return;
  }
  for (const [name, value] of pending) {
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      console.warn('[persist] failed to write', name, e);
    }
  }
  pending.clear();
  armed = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

/** Arm persistence: the pending (or next) state change will be flushed. */
export function armPersist() {
  armed = true;
  if (!timer) {
    timer = setTimeout(flush, DEBOUNCE_MS);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Only flush if a trade armed us; otherwise skip the per-tick noise and
    // don't write a fresh snapshot on a no-trade refresh.
    if (armed && pending.size > 0) flush();
  });
}

export function createDebouncedJSONStorage() {
  const storage: StateStorage = {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      if (armed && !timer) {
        timer = setTimeout(flush, DEBOUNCE_MS);
      }
    },
    removeItem: (name) => {
      pending.delete(name);
      localStorage.removeItem(name);
    },
  };

  return createJSONStorage(() => storage);
}
