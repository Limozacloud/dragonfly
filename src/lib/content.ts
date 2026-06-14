import { Note } from '@/types';

// ── BlockNote type definitions ────────────────────────────────────────

export interface BlockNoteContentItem {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
  href?: string;
}

export interface BlockNoteBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: BlockNoteContentItem[];
  children: BlockNoteBlock[];
}

// ── Text extraction ───────────────────────────────────────────────────

/**
 * Recursively extract plain text from a BlockNote block array.
 * Works on the already-parsed block structure.
 */
export function extractBlockNoteText(blocks: BlockNoteBlock[]): string {
  let text = '';
  for (const block of blocks) {
    if (block.content) {
      for (const item of block.content) {
        if (item.text) text += item.text;
      }
      text += '\n';
    }
    if (block.children?.length) {
      text += extractBlockNoteText(block.children);
    }
  }
  return text.trim();
}

/**
 * Extract plain text from a BlockNote JSON string (as stored in the DB).
 * Returns an empty string on parse errors.
 */
export function extractTextFromJson(contentJson: string): string {
  try {
    const blocks: BlockNoteBlock[] = JSON.parse(contentJson);
    return blocks
      .map((block) =>
        (block.content || []).map((item) => item.text || '').join('')
      )
      .join(' ')
      .trim();
  } catch {
    return '';
  }
}

/** Returns true when a note has actual text content worth keeping. */
export function noteHasContent(note: Note): boolean {
  return !!note.title.trim() || !!extractTextFromJson(note.content).trim();
}

// ── Heading extraction ────────────────────────────────────────────────

export interface NoteHeading {
  id: string;
  level: number;
  text: string;
}

/** Recursively extract all headings from a BlockNote block array (for TOC). */
export function extractHeadings(blocks: BlockNoteBlock[]): NoteHeading[] {
  const headings: NoteHeading[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      const text = (block.content as BlockNoteContentItem[])
        ?.map((c) => c.text || '')
        .join('') ?? '';
      if (text.trim()) {
        headings.push({ id: block.id, level: (block.props as { level: number }).level, text });
      }
    }
    if (block.children?.length) {
      headings.push(...extractHeadings(block.children));
    }
  }
  return headings;
}

// ── Attachment references ─────────────────────────────────────────────

/**
 * Parse all UUIDs referenced inside a BlockNote JSON string.
 * Used to detect attachment IDs still in use before orphan cleanup.
 */
export function extractAttachmentIds(contentJson: string): Set<string> {
  const ids = new Set<string>();
  if (!contentJson) return ids;
  const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  for (const m of contentJson.matchAll(uuidRegex)) ids.add(m[1]);
  return ids;
}
