import type { GraphDocument } from '@fcw/graph-core';
import { toJSON } from '@fcw/graph-core';
import { traverseLog } from './log-traversal.js';
import type { LogEntry } from './log-traversal.js';

function formatEntry(entry: LogEntry, indent: string): string {
  const prefix = entry.depth > 0 ? `${indent}> *Branch:*\n${indent}` : '';

  switch (entry.type) {
    case 'user_prompt':
      return `${prefix}> ${entry.content}`;
    case 'code':
      return `${prefix}\`\`\`\n${entry.content}\n\`\`\``;
    case 'tool_call':
      return `${prefix}**Tool call:** ${entry.content}`;
    case 'tool_result':
      return `${prefix}**Tool result:** ${entry.content}`;
    case 'thought':
      return `${prefix}*Thought:* ${entry.content}`;
    case 'annotation':
      return `${prefix}*[${entry.content}]*`;
    case 'summary':
      return `${prefix}**Summary:** ${entry.content}`;
    default:
      return `${prefix}${entry.content}`;
  }
}

export function exportAsMarkdown(doc: GraphDocument): string {
  const entries = traverseLog(doc);
  if (entries.length === 0) return `# ${doc.meta.title}`;

  const lines = [`# ${doc.meta.title}`, ''];

  let prevDepth = 0;
  for (const entry of entries) {
    const indent = '  '.repeat(entry.depth);
    if (entry.depth > prevDepth) {
      lines.push('');
    }
    lines.push(formatEntry(entry, indent));
    lines.push('');
    prevDepth = entry.depth;
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function exportAsJson(doc: GraphDocument): string {
  return toJSON(doc);
}
