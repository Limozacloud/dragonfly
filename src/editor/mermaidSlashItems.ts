import { createElement } from 'react';
import { IconSitemap } from '@tabler/icons-react';

// Use opaque `object` type so any concrete BlockNote editor can be assigned here.
// The actual editor methods are accessed via a typed local alias below.
type MermaidEditor = object;

interface MermaidEditorImpl {
  insertBlocks: (blocks: { type: string; props: Record<string, string> }[], referenceBlock: unknown, placement: 'after' | 'before' | 'nested') => void;
  getTextCursorPosition: () => { block: unknown };
}

export function getMermaidSlashMenuItems(editor: MermaidEditor) {
  const e = editor as unknown as MermaidEditorImpl;
  return [
    {
      title: 'Mermaid Diagram',
      onItemClick: () => {
        e.insertBlocks(
          [{ type: 'mermaid', props: { code: 'graph TD\n    A --> B' } }],
          e.getTextCursorPosition().block,
          'after'
        );
      },
      aliases: ['mermaid', 'diagram', 'chart', 'flow', 'flowchart', 'sequence'],
      group: 'Media',
      icon: createElement(IconSitemap, { size: 18 }),
      subtext: 'Insert a Mermaid diagram',
    },
  ];
}
