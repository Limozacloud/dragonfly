// CAB (Change Advisory Board) Report Generator
import { Task, Release, User } from '../types';
import { getApiKey } from './aiService';
import { extractTextFromJson } from '@/lib/content';

interface BlockNoteContent {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
}

interface BlockNoteBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: BlockNoteContent[];
  children: BlockNoteBlock[];
}

function block(type: string, text: string, styles?: Record<string, unknown>): BlockNoteBlock {
  return {
    id: crypto.randomUUID(),
    type,
    props: {},
    content: text ? [{ type: 'text', text, styles: styles || {} }] : [],
    children: [],
  };
}

function heading(text: string, level: number): BlockNoteBlock {
  return {
    id: crypto.randomUUID(),
    type: 'heading',
    props: { level },
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  };
}

function bulletItem(text: string, bold?: string): BlockNoteBlock {
  const content: BlockNoteContent[] = [];
  if (bold) {
    content.push({ type: 'text', text: bold, styles: { bold: true } });
    content.push({ type: 'text', text, styles: {} });
  } else {
    content.push({ type: 'text', text, styles: {} });
  }
  return {
    id: crypto.randomUUID(),
    type: 'bulletListItem',
    props: {},
    content,
    children: [],
  };
}

function emptyParagraph(): BlockNoteBlock {
  return block('paragraph', '');
}

// extractTextFromContent → replaced by extractTextFromJson from @/lib/content
function extractTextFromContent(contentJson: string): string {
  return extractTextFromJson(contentJson);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    backlog: 'Backlog',
    todo: 'To Do',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
  };
  return map[status] || status;
}

export function generateCABBlocks(
  release: Release,
  tasks: Task[],
  users: User[]
): BlockNoteBlock[] {
  const releaseTasks = tasks.filter((t) => t.releaseId === release.id);
  const features = releaseTasks.filter((t) => t.type === 'feature');
  const childTasks = releaseTasks.filter((t) => t.type === 'task');
  const doneTasks = releaseTasks.filter((t) => t.status === 'done');
  const now = new Date().toLocaleDateString();

  const blocks: BlockNoteBlock[] = [];

  // Title
  blocks.push(heading(`CAB Report - ${release.name}`, 1));
  blocks.push(block('paragraph', `Generated: ${now}`));
  blocks.push(emptyParagraph());

  // 1. Change Summary
  blocks.push(heading('1. Change Summary', 2));
  blocks.push(block('paragraph', release.description || '(No description)'));
  blocks.push(emptyParagraph());

  // 2. Scope
  blocks.push(heading('2. Scope', 2));
  blocks.push(bulletItem(` ${release.name}`, 'Release:'));
  blocks.push(bulletItem(` ${features.length}`, 'Features:'));
  blocks.push(bulletItem(` ${releaseTasks.length}`, 'Tasks:'));
  blocks.push(bulletItem(` ${doneTasks.length}/${releaseTasks.length}`, 'Completion:'));
  blocks.push(emptyParagraph());

  // 3. Changes
  blocks.push(heading('3. Changes', 2));

  // Group tasks by feature
  for (const feature of features) {
    blocks.push(heading(feature.title, 3));

    const featureDesc = extractTextFromContent(feature.content);
    blocks.push(bulletItem(` ${statusLabel(feature.status)}`, 'Status:'));
    if (featureDesc) {
      blocks.push(block('paragraph', featureDesc));
    }

    const featureChildren = childTasks.filter((t) => t.featureId === feature.id);
    if (featureChildren.length > 0) {
      blocks.push(block('paragraph', 'Tasks:'));
      for (const child of featureChildren) {
        const assignee = users.find((u) => u.id === child.assigneeId);
        const assigneeStr = assignee ? ` (${assignee.name})` : '';
        blocks.push(bulletItem(`${child.title} - ${statusLabel(child.status)}${assigneeStr}`));
      }
    }
    blocks.push(emptyParagraph());
  }

  // Standalone tasks (no feature or feature not in this release)
  const standaloneTasks = childTasks.filter(
    (t) => !t.featureId || !features.some((f) => f.id === t.featureId)
  );
  if (standaloneTasks.length > 0) {
    blocks.push(heading('Standalone Tasks', 3));
    for (const task of standaloneTasks) {
      const assignee = users.find((u) => u.id === task.assigneeId);
      const assigneeStr = assignee ? ` (${assignee.name})` : '';
      blocks.push(bulletItem(`${task.title} - ${statusLabel(task.status)}${assigneeStr}`));
    }
    blocks.push(emptyParagraph());
  }

  // 4. Rollback Plan
  blocks.push(heading('4. Rollback Plan', 2));
  blocks.push(block('paragraph', '(To be completed)'));

  return blocks;
}

function blocksToMarkdown(blocks: BlockNoteBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    const text = b.content?.map((c) => {
      if (c.styles && (c.styles as Record<string, unknown>).bold) return `**${c.text}**`;
      return c.text || '';
    }).join('') || '';

    if (b.type === 'heading') {
      const level = (b.props.level as number) || 1;
      lines.push(`${'#'.repeat(level)} ${text}`);
    } else if (b.type === 'bulletListItem') {
      lines.push(`- ${text}`);
    } else {
      lines.push(text);
    }
  }
  return lines.join('\n');
}

export const DEFAULT_CAB_PROMPT = `You are a technical writer. You will receive a CAB (Change Advisory Board) report in markdown.
Improve the writing quality: fix grammar, make it more professional and concise.
CRITICAL RULES:
1. Keep ALL facts, numbers, names, and statuses exactly as they are
2. Maintain the same CAB structure and headings
3. Keep the same language as the input
4. Return ONLY the improved markdown, no explanations
5. Do not add or remove sections
6. Fill in risk assessment rows if you can infer risks from the changes listed`;

export async function improveCABReport(blocks: BlockNoteBlock[], customPrompt?: string): Promise<BlockNoteBlock[]> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured');

  const markdown = blocksToMarkdown(blocks);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: customPrompt || DEFAULT_CAB_PROMPT,
        },
        { role: 'user', content: markdown },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(error.error?.message || `API Error: ${response.status}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = await response.json() as { choices?: { message?: { content?: string } }[] };
  } catch {
    throw new Error('AI returned invalid JSON response');
  }
  const improved = data.choices?.[0]?.message?.content?.trim();
  if (!improved) throw new Error('No response from AI');

  return markdownToBlocks(improved);
}

function markdownToBlocks(md: string): BlockNoteBlock[] {
  const lines = md.split('\n');
  const blocks: BlockNoteBlock[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push(heading(headingMatch[2], headingMatch[1].length));
      continue;
    }

    // Bullet
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1];
      // Check for bold prefix like **Status:** value
      const boldMatch = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
      if (boldMatch) {
        blocks.push(bulletItem(boldMatch[2] ? ` ${boldMatch[2]}` : '', boldMatch[1]));
      } else {
        blocks.push(bulletItem(text));
      }
      continue;
    }

    // Empty line
    if (!trimmed) {
      blocks.push(emptyParagraph());
      continue;
    }

    // Table separator - skip
    if (/^\|[-\s|]+\|$/.test(trimmed)) {
      blocks.push(block('paragraph', trimmed));
      continue;
    }

    // Regular paragraph (including table rows)
    // Handle bold in paragraphs
    const parts: BlockNoteContent[] = [];
    const remaining = trimmed;
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = boldRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', text: remaining.slice(lastIndex, match.index), styles: {} });
      }
      parts.push({ type: 'text', text: match[1], styles: { bold: true } });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
      parts.push({ type: 'text', text: remaining.slice(lastIndex), styles: {} });
    }

    if (parts.length === 0) {
      blocks.push(block('paragraph', trimmed));
    } else {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'paragraph',
        props: {},
        content: parts,
        children: [],
      });
    }
  }

  return blocks;
}
