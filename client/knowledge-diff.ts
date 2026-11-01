export interface DiffRow {
  kind: 'same' | 'removed' | 'added' | 'gap';
  text: string;
  prefix?: string;
  suffix?: string;
  change?: string;
}
// Monotonic line matching: bounded memory/time even for 512 KiB documents with
// many repeated lines. This is a valid edit script, not necessarily a minimal one.
export function knowledgeDiff(before: string, after: string) {
  const a = before.split('\n'),
    b = after.split('\n');
  const positions = new Map<string, number[]>();
  b.forEach((line, index) => {
    const list = positions.get(line) ?? [];
    list.push(index);
    positions.set(line, list);
  });
  const rows: DiffRow[] = [];
  let cursor = 0;
  for (const line of a) {
    const matches = positions.get(line) ?? [];
    let low = 0,
      high = matches.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (matches[mid] < cursor) low = mid + 1;
      else high = mid;
    }
    if (low === matches.length) rows.push({ kind: 'removed', text: line });
    else {
      const index = matches[low];
      while (cursor < index) rows.push({ kind: 'added', text: b[cursor++] });
      rows.push({ kind: 'same', text: line });
      cursor++;
    }
  }
  while (cursor < b.length) rows.push({ kind: 'added', text: b[cursor++] });
  // In replacement runs, preserve common characters in their normal color.
  for (let start = 0; start < rows.length;) {
    if (rows[start].kind === 'same') {
      start++;
      continue;
    }
    let end = start;
    while (end < rows.length && rows[end].kind !== 'same') end++;
    const removed = rows.slice(start, end).filter((r) => r.kind === 'removed');
    const added = rows.slice(start, end).filter((r) => r.kind === 'added');
    for (let i = 0; i < Math.min(removed.length, added.length); i++) {
      const left = Array.from(removed[i].text),
        right = Array.from(added[i].text);
      let prefix = 0,
        suffix = 0;
      while (prefix < Math.min(left.length, right.length) && left[prefix] === right[prefix])
        prefix++;
      while (
        suffix < Math.min(left.length, right.length) - prefix &&
        left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
      )
        suffix++;
      for (const [row, chars] of [
        [removed[i], left],
        [added[i], right],
      ] as const) {
        row.prefix = chars.slice(0, prefix).join('');
        row.suffix = chars.slice(chars.length - suffix).join('');
        row.change = chars.slice(prefix, chars.length - suffix).join('');
      }
    }
    start = end;
  }
  const added = rows.filter((r) => r.kind === 'added').length;
  const removed = rows.filter((r) => r.kind === 'removed').length;
  const visible = new Set<number>();
  rows.forEach((row, i) => {
    if (row.kind !== 'same')
      for (let j = Math.max(0, i - 2); j <= Math.min(rows.length - 1, i + 2); j++) visible.add(j);
  });
  const excerpt: DiffRow[] = [];
  rows.forEach((row, i) => {
    if (visible.has(i)) excerpt.push(row);
    else if (excerpt.at(-1)?.kind !== 'gap')
      excerpt.push({ kind: 'gap', text: '… contexto sin cambios …' });
  });
  // Only expose an affected heading when the entire edit lies under one
  // unambiguous ATX heading in both documents, excluding fenced code.
  function headings(text: string, changedKind: DiffRow['kind']) {
    const affected = new Set<string>();
    let heading = '';
    let fence = '';
    let index = 0;
    const lines = text.split('\n');
    for (const row of rows) {
      if (row.kind !== changedKind && row.kind !== 'same') continue;
      const line = lines[index++];
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      }
      if (!fence) {
        const h = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (h) heading = h[1];
      }
      if (row.kind === changedKind) affected.add(heading);
    }
    return affected;
  }
  const sections = new Set([...headings(before, 'removed'), ...headings(after, 'added')]);
  return {
    rows: excerpt,
    added,
    removed,
    section: sections.size === 1 && !sections.has('') ? [...sections][0] : null,
    type:
      added && removed ? 'Reemplazo' : added ? 'Agregado' : removed ? 'Eliminación' : 'Sin cambios',
    summary:
      added || removed
        ? `${added} línea(s) agregada(s), ${removed} eliminada(s)`
        : 'Contenido idéntico; no genera una nueva versión',
  };
}
