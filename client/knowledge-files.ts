// Filenames never become server paths. UUID suffix distinguishes equal titles.
export function knowledgeFilename(title: string, id: string) {
  const slug =
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)
      .replace(/-+$/g, '') || 'documento';
  const suffix = id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || 'exportacion';
  return `${slug}-${suffix}.md`;
}

export function suggestedMarkdownTitle(content: string, filename: string) {
  let fence: { character: string; length: number } | undefined;
  for (const line of content.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = undefined;
      continue;
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    const heading = /^ {0,3}#(?:[\t ]+)(.*)$/.exec(line);
    const title = heading?.[1].replace(/[\t ]+#+[\t ]*$/, '').trim();
    if (
      title &&
      title.length <= 240 &&
      !Array.from(title).some((character) => character.charCodeAt(0) < 32)
    )
      return title;
  }
  return (
    filename
      .split(/[\\/]/)
      .pop()!
      .replace(/\.md$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N} .(),]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) || 'Documento importado'
  );
}
