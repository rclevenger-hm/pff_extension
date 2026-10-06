import { normalizeDirectory } from './players.js';
export const DIRECTORY_KEY = 'playerDirectoryV1';
export const DIRECTORY_ORIGIN = 'https://api.sleeper.app/*';
export const DIRECTORY_URL = 'https://api.sleeper.app/v1/players/nfl';
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
let inFlight;
export async function loadDirectory({ storage, permissions, fetcher = fetch, now = Date.now() }) {
  const stored = (await storage.get(DIRECTORY_KEY))[DIRECTORY_KEY];
  const cache = stored?.version === 1 && Array.isArray(stored.players) && stored.players.length && Number.isFinite(stored.fetchedAt) ? stored : null;
  if (cache && now >= cache.fetchedAt && now - cache.fetchedAt < MAX_AGE_MS) return { directory: cache, stale: false };
  if (!await permissions.contains({ origins: [DIRECTORY_ORIGIN] })) return { directory: cache, stale: Boolean(cache), needsPermission: true };
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const response = await fetcher(DIRECTORY_URL, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Directory download failed.');
        const maxBytes = 25 * 1024 * 1024;
        if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Directory exceeds the size limit.');
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); throw new Error('Directory exceeds the size limit.'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const players = normalizeDirectory(JSON.parse(new TextDecoder().decode(bytes)));
        const directory = { version: 1, fetchedAt: now, players };
        await storage.set({ [DIRECTORY_KEY]: directory });
        return { directory, stale: false };
      } catch {
        return { directory: cache, stale: Boolean(cache), error: 'Could not update the player directory. Check your connection and try again.' };
      }
    })().finally(() => { inFlight = null; });
  }
  return inFlight;
}
