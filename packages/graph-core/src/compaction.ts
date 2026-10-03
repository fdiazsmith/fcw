// Legacy Compaction entity (pre structure-first). Only its shape survives:
// migrateCompactions reads it from old .fcw.json files (the chat_compaction_*
// messages that carried it were deleted at M3.6).
import type { Position } from './types.js';

export type CompactionStatus = 'generating' | 'idle';

export interface Compaction {
  id: string;
  title: string;
  /** Chat ids preserved "behind" this node. */
  memberIds: string[];
  /** Editable document synthesized from the member transcripts (markdown). */
  document: string;
  /** Digest of member transcripts when the document was last (re)generated. */
  sourceDigest: string;
  position: Position;
  createdAt: string;
  status: CompactionStatus;
}
