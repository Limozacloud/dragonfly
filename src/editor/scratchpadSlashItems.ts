import { createElement } from 'react';
import { IconBrush } from '@tabler/icons-react';

// Opaque editor reference passed through to the picker modal — the modal
// calls insertOrUpdateBlockForSlashMenu which accepts it as-is.
export type SlashMenuEditor = object;

export function getScratchpadSlashMenuItems(editor: SlashMenuEditor, openPicker: (editor: SlashMenuEditor) => void) {
  return [
    {
      title: 'Scratchpad',
      onItemClick: () => openPicker(editor),
      aliases: ['scratchpad', 'drawing', 'excalidraw'],
      group: 'Media',
      icon: createElement(IconBrush, { size: 18 }),
      subtext: 'Embed a scratchpad drawing',
    },
  ];
}
