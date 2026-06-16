import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { IconChevronRight, IconChevronDown, IconNote, IconPlus, IconStar, IconStarFilled } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { Note } from '../types';
import { useNoteStore } from '../stores/noteStore';

interface NoteTreeItemProps {
  note: Note;
  level: number;
  activeNoteId: string | null;
  onSelect: (note: Note) => void;
  onCreateChild: (parentId: string) => void;
  filterMatch: Set<string>;
  expandSignal: { key: number; expanded: boolean };
  sortFn: (a: Note, b: Note) => number;
}

function NoteTreeItem({ note, level, activeNoteId, onSelect, onCreateChild, filterMatch, expandSignal, sortFn }: NoteTreeItemProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const { getChildren, toggleFavorite } = useNoteStore();

  useEffect(() => {
    setIsExpanded(expandSignal.expanded);
    // expandSignal.key is the trigger — intentionally not including expandSignal.expanded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal.key]);

  const children = getChildren(note.id).slice().sort(sortFn);
  const hasChildren = children.length > 0;
  const isActive = activeNoteId === note.id;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: note.id,
    data: { note },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: note.id,
    data: { note },
  });

  if (filterMatch.size > 0 && !filterMatch.has(note.id)) {
    return null;
  }

  const visibleChildren = children.filter((c) => filterMatch.size === 0 || filterMatch.has(c.id));

  return (
    <div ref={setDropRef}>
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        className={cn(
          'group flex items-center gap-1 py-1 px-2 cursor-pointer text-sm select-none hover:bg-muted/60 transition-colors',
          isActive && 'bg-primary/10 text-primary font-medium',
          isOver && !isDragging && 'bg-primary/15 outline outline-1 outline-primary/40',
          isDragging && 'opacity-40'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(note)}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className={cn(
            'shrink-0 p-0.5 hover:bg-muted rounded-sm',
            !hasChildren && 'invisible'
          )}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </button>

        <IconNote size={15} className="shrink-0 text-muted-foreground" />

        <span className="truncate flex-1 ml-1">{note.title || t('notes.untitled')}</span>

        {/* Favorite toggle */}
        <button
          type="button"
          className={cn(
            'shrink-0 p-0.5 hover:bg-muted rounded-sm transition-opacity',
            note.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(note.id);
          }}
          title={note.favorite ? t('notes.removeFromFavorites') : t('notes.addToFavorites')}
        >
          {note.favorite ? (
            <IconStarFilled size={14} className="text-amber-500" />
          ) : (
            <IconStar size={14} className="text-muted-foreground" />
          )}
        </button>

        {/* Add child button on hover */}
        <button
          type="button"
          className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted rounded-sm transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
            onCreateChild(note.id);
          }}
          title={t('notes.addSubNote')}
        >
          <IconPlus size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {visibleChildren.map((child) => (
            <NoteTreeItem
              key={child.id}
              note={child}
              level={level + 1}
              activeNoteId={activeNoteId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              filterMatch={filterMatch}
              expandSignal={expandSignal}
              sortFn={sortFn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default NoteTreeItem;
