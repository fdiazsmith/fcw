// Parse Obsidian-style [[wikilinks]] from Markdown text.
// Returns the link targets in document order.
export function parseWikilinks(markdown: string): string[] {
  const targets: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    targets.push(match[1].trim());
  }
  return targets;
}
