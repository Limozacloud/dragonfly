import { useState, useEffect, useRef, useCallback } from 'react';
import { IconBrush, IconExternalLink } from '@tabler/icons-react';
import { useScratchpadStore } from '@/stores/scratchpadStore';

interface ScratchpadBlockProps {
  scratchpadId: string;
  title: string;
  previewHeight: number;
  previewWidth: number; // percentage 10-100
  onSizeChange: (height: number, width: number) => void;
}

export function ScratchpadBlockComponent({
  scratchpadId,
  title,
  previewHeight,
  previewWidth,
  onSizeChange,
}: ScratchpadBlockProps) {
  const scratchpad = useScratchpadStore((state) =>
    state.scratchpads.find((s) => s.id === scratchpadId)
  );
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [height, setHeight] = useState(previewHeight);
  const [widthPct, setWidthPct] = useState(previewWidth);
  const sizeRef = useRef({ height, widthPct });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startHeight: number;
    startWidthPct: number;
    containerWidth: number;
  } | null>(null);
  const onSizeChangeRef = useRef(onSizeChange);
  onSizeChangeRef.current = onSizeChange;

  useEffect(() => {
    sizeRef.current = { height, widthPct };
  }, [height, widthPct]);

  useEffect(() => {
    if (!scratchpad?.content) {
      setSvgHtml(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const parsed = JSON.parse(scratchpad.content);
        const elements = parsed.elements || [];
        if (elements.length === 0) {
          setSvgHtml(null);
          return;
        }

        const { exportToSvg } = await import('@excalidraw/excalidraw');
        const svg = await exportToSvg({
          elements,
          appState: {
            exportWithDarkMode: false,
            exportBackground: false,
            exportPadding: 5,
          },
          files: parsed.files || null,
        });

        if (!cancelled) {
          setSvgHtml(svg.outerHTML);
        }
      } catch {
        if (!cancelled) setSvgHtml(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scratchpad?.content, scratchpad?.updatedAt]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;

    const deltaY = e.clientY - d.startY;
    const newHeight = Math.max(80, d.startHeight + deltaY);

    const deltaX = e.clientX - d.startX;
    const deltaWidthPx = deltaX;
    const deltaWidthPct = (deltaWidthPx / d.containerWidth) * 100;
    const newWidthPct = Math.min(100, Math.max(20, d.startWidthPct + deltaWidthPct));

    setHeight(newHeight);
    setWidthPct(newWidthPct);
    sizeRef.current = { height: newHeight, widthPct: newWidthPct };
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      if (typeof onSizeChangeRef.current === 'function') {
        onSizeChangeRef.current(
          Math.round(sizeRef.current.height),
          Math.round(sizeRef.current.widthPct)
        );
      }
    }
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const containerWidth =
        containerRef.current?.parentElement?.clientWidth ||
        containerRef.current?.clientWidth ||
        600;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startHeight: sizeRef.current.height,
        startWidthPct: sizeRef.current.widthPct,
        containerWidth,
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp]
  );

  // Cleanup document listeners on unmount (prevents stale handlers after HMR)
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragRef.current = null;
    };
  }, [handleMouseMove, handleMouseUp]);

  const displayTitle = scratchpad?.title || title || 'Scratchpad';

  const handleNavigate = () => {
    window.dispatchEvent(
      new CustomEvent('dragonfly-navigate-scratchpad', {
        detail: { scratchpadId },
      })
    );
  };

  if (!scratchpad) {
    return (
      <div className="border border-border bg-muted/30 p-4 text-sm text-muted-foreground italic">
        Scratchpad not found
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative border border-border overflow-hidden hover:border-primary/50 transition-colors"
      style={{ width: `${widthPct}%` }}
      contentEditable={false}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-primary to-[#005a8c] text-white text-sm font-medium">
        <IconBrush size={15} />
        <span className="truncate">{displayTitle}</span>
      </div>

      {/* SVG Preview */}
      <div className="bg-white overflow-hidden" style={{ height }}>
        {svgHtml ? (
          <div
            className="w-full h-full p-2 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Empty drawing
          </div>
        )}
      </div>

      {/* Footer: link */}
      <div className="flex items-center border-t border-border bg-muted/40">
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-1 text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
          onClick={handleNavigate}
        >
          <IconExternalLink size={12} />
          Open in Scratchpad
        </button>
      </div>

      {/* Corner resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group"
        onMouseDown={handleResizeStart}
      >
        <svg
          viewBox="0 0 16 16"
          className="w-full h-full text-muted-foreground/60 group-hover:text-muted-foreground"
        >
          <path d="M14 16L16 14M10 16L16 10M6 16L16 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}
