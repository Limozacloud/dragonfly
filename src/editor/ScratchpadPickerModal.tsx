import { useState, useEffect } from 'react';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { IconBrush } from '@tabler/icons-react';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { useScratchpadStore } from '@/stores/scratchpadStore';
import type { SlashMenuEditor } from './scratchpadSlashItems';

interface ScratchpadPickerModalProps {
  editor: SlashMenuEditor | null;
  onClose: () => void;
}

export function ScratchpadPickerModal({ editor, onClose }: ScratchpadPickerModalProps) {
  const scratchpads = useScratchpadStore((s) => s.scratchpads);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (editor) setSelectedId(scratchpads[0]?.id ?? '');
  }, [editor, scratchpads]);

  const handleConfirm = () => {
    const sp = scratchpads.find((s) => s.id === selectedId);
    if (!sp || !editor) return;
    // insertOrUpdateBlockForSlashMenu expects the full editor type; we pass the
    // opaque reference received from the slash menu callback — safe at runtime.
    insertOrUpdateBlockForSlashMenu(editor as Parameters<typeof insertOrUpdateBlockForSlashMenu>[0], {
      type: 'scratchpad',
      props: { scratchpadId: sp.id, title: sp.title },
    } as unknown as Parameters<typeof insertOrUpdateBlockForSlashMenu>[1]);
    onClose();
  };

  return (
    <AppModal
      isOpen={!!editor}
      onClose={onClose}
      title={
        <>
          <IconBrush size={18} />
          Insert Scratchpad
        </>
      }
      size="sm"
      footer={
        <>
          <Button onClick={handleConfirm} disabled={!selectedId} className="ml-auto">
            Insert
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-foreground">Select a scratchpad</label>
        {scratchpads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scratchpads available.</p>
        ) : (
          <select
            className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {scratchpads.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.title || 'Untitled Scratchpad'}
              </option>
            ))}
          </select>
        )}
      </div>
    </AppModal>
  );
}
