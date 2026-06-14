import { describe, it, expect } from 'vitest';
import {
  extractBlockNoteText,
  extractTextFromJson,
  extractAttachmentIds,
  noteHasContent,
  type BlockNoteBlock,
} from '@/lib/content';
import type { Note } from '@/types';

const block = (text: string, children: BlockNoteBlock[] = []): BlockNoteBlock => ({
  id: crypto.randomUUID(),
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text }],
  children,
});

describe('extractBlockNoteText', () => {
  it('extracts text from a single block', () => {
    expect(extractBlockNoteText([block('Hello')])).toBe('Hello');
  });

  it('extracts text from multiple blocks', () => {
    expect(extractBlockNoteText([block('Foo'), block('Bar')])).toBe('Foo\nBar');
  });

  it('extracts text from nested children', () => {
    const parent = block('Parent', [block('Child')]);
    expect(extractBlockNoteText([parent])).toBe('Parent\nChild');
  });

  it('returns empty string for empty array', () => {
    expect(extractBlockNoteText([])).toBe('');
  });

  it('skips blocks with no content items', () => {
    const empty: BlockNoteBlock = { id: '1', type: 'paragraph', props: {}, content: [], children: [] };
    expect(extractBlockNoteText([empty])).toBe('');
  });
});

describe('extractTextFromJson', () => {
  it('extracts text from valid JSON', () => {
    const json = JSON.stringify([block('Hello world')]);
    expect(extractTextFromJson(json)).toBe('Hello world');
  });

  it('returns empty string for invalid JSON', () => {
    expect(extractTextFromJson('not-json')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractTextFromJson('')).toBe('');
  });

  it('joins multiple blocks with a space', () => {
    const json = JSON.stringify([block('Foo'), block('Bar')]);
    expect(extractTextFromJson(json)).toBe('Foo Bar');
  });
});

describe('extractAttachmentIds', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('finds a UUID in content', () => {
    const ids = extractAttachmentIds(`some text ${uuid} more`);
    expect(ids.has(uuid)).toBe(true);
  });

  it('finds multiple UUIDs', () => {
    const uuid2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const ids = extractAttachmentIds(`${uuid} and ${uuid2}`);
    expect(ids.size).toBe(2);
  });

  it('returns empty set for empty string', () => {
    expect(extractAttachmentIds('').size).toBe(0);
  });

  it('returns empty set when no UUIDs present', () => {
    expect(extractAttachmentIds('no uuids here').size).toBe(0);
  });
});

describe('noteHasContent', () => {
  const base: Note = {
    id: '1', projectId: 'p', parentId: null, favorite: false,
    createdAt: '', updatedAt: '', tags: [], title: '', content: '',
  };

  it('returns true when title is non-empty', () => {
    expect(noteHasContent({ ...base, title: 'My Note' })).toBe(true);
  });

  it('returns true when content has text', () => {
    const json = JSON.stringify([block('Some content')]);
    expect(noteHasContent({ ...base, content: json })).toBe(true);
  });

  it('returns false when both title and content are empty', () => {
    const emptyContent = JSON.stringify([block('')]);
    expect(noteHasContent({ ...base, content: emptyContent })).toBe(false);
  });
});
