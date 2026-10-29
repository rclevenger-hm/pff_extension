import { cleanText } from './players.js';
import { recentIds } from './ui.js';

export const RESET_KEY = 'researchResetGeneration';

function sessionKey(windowId) {
  if (!Number.isSafeInteger(windowId) || windowId < 0) throw new TypeError('Invalid browser window.');
  return `researchUI:${windowId}`;
}

function currentGeneration(data) {
  return typeof data[RESET_KEY] === 'string' && data[RESET_KEY] ? data[RESET_KEY] : null;
}

function cleanState(state, generation, cleared = false) {
  return {
    query: cleanText(state?.query),
    selectedId: cleared ? null : recentIds([state?.selectedId])[0] || null,
    recentIds: cleared ? [] : recentIds(state?.recentIds),
    lastRequestAt: Number.isFinite(state?.lastRequestAt) ? state.lastRequestAt : null,
    generation,
  };
}

// The service worker owns one instance. Serialize all reads, writes, and resets
// so a save already in progress cannot finish after a successful reset.
export function createResearchSessions(storage) {
  let pending = Promise.resolve();
  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  return {
    load(windowId) {
      return enqueue(async () => {
        const key = sessionKey(windowId);
        const requestKey = `research:${windowId}`;
        const data = await storage.get([RESET_KEY, key, requestKey]);
        const generation = currentGeneration(data);
        const state = data[key];
        return {
          generation,
          state: state == null ? null : cleanState(state, generation, (state.generation ?? null) !== generation),
          request: data[requestKey] ?? null,
        };
      });
    },
    save(windowId, state, generation = null) {
      return enqueue(async () => {
        const key = sessionKey(windowId);
        const current = currentGeneration(await storage.get(RESET_KEY));
        const cleared = generation !== current;
        // Ignore the entire stale snapshot: even its query could overwrite newer
        // research committed after the reset by another panel in this window.
        if (!cleared) await storage.set({ [key]: cleanState(state, current) });
        return { generation: current, cleared };
      });
    },
    clear() {
      return enqueue(async () => {
        const data = await storage.get(null);
        const generation = crypto.randomUUID();
        const updates = { [RESET_KEY]: generation };
        for (const [key, state] of Object.entries(data)) {
          if (/^researchUI:\d+$/.test(key)) updates[key] = cleanState(state, generation, true);
        }
        // Publish the new generation and cleared states in one storage update.
        await storage.set(updates);
        return { generation };
      });
    },
  };
}
