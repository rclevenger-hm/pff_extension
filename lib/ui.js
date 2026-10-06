// Shared interface primitives. Icon geometry is packaged, never downloaded.
const paths = {
  field: ['M4 3h16v18H4z', 'M4 8h16M4 16h16M8 8v8m8-8v8M10 12h4'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  sources: ['M14 3h7v7m0-7L11 13', 'M10 5H4v15h15v-6'],
  settings: ['M4 7h16M4 17h16', 'M8 4v6m8 4v6'],
  arrow: ['M5 12h14m-5-5 5 5-5 5'],
  back: ['M19 12H5m5-5-5 5 5 5'],
  close: ['m6 6 12 12M6 18 18 6'],
  star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 7v5l3 2'],
  filter: ['M4 6h16M7 12h10m-7 6h4'],
  check: ['m5 12 4 4L19 6'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2'],
  chevron: ['m8 5 7 7-7 7'],
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'})) svg.setAttribute(key,value);
  svg.classList.add('icon');
  for (const d of paths[name] || paths.field) {
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function normalizeTheme(value) { return ['light','dark'].includes(value) ? value : 'system'; }
export function recentIds(value, nextId) {
  const ids = Array.isArray(value) ? value.filter(id => typeof id === 'string' && /^\d+$/.test(id)) : [];
  return [...new Set(typeof nextId === 'string' && /^\d+$/.test(nextId) ? [nextId, ...ids] : ids)].slice(0, 6);
}
export function directoryAge(fetchedAt, now = Date.now()) {
  if (!Number.isFinite(fetchedAt)) return 'Not downloaded';
  const hours = Math.max(0, Math.floor((now - fetchedAt) / 3600000));
  return hours === 0 ? 'Downloaded just now' : hours < 24 ? `Downloaded ${hours}h ago` : `Downloaded ${Math.floor(hours / 24)}d ago`;
}
