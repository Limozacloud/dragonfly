import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

interface MermaidBlockProps {
  code: string;
  editor: { isEditable: boolean };
  onChange: (code: string) => void;
}

export function MermaidBlockComponent({ code, editor, onChange }: MermaidBlockProps) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code.trim()) {
      setPreview('');
      setError('');
      return;
    }
    setError('');
    mermaid
      .render(`mermaid-${crypto.randomUUID()}`, code)
      .then(({ svg }) => setPreview(svg))
      .catch((err: unknown) => {
        setPreview('');
        setError(String(err));
      });
  }, [code]);

  // editor.isEditable is read directly — ProseMirror re-renders node views
  // on setEditable(), so this value is always current at render time.
  if (editor.isEditable) {
    return (
      <div
        className="my-1 w-full rounded border border-input bg-muted/30 overflow-hidden"
        contentEditable={false}
      >
        <div className="px-2 py-1 text-[0.65rem] font-mono font-semibold text-muted-foreground border-b border-input bg-muted/50 select-none">
          Mermaid
        </div>
        <textarea
          className="block w-full font-mono text-sm p-3 bg-transparent outline-none resize-y min-h-[140px]"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={'graph TD\n    A --> B'}
          rows={6}
        />
      </div>
    );
  }

  // View mode
  if (!code.trim()) {
    return (
      <div className="my-1 p-3 text-center text-muted-foreground text-sm italic border border-dashed border-muted-foreground/30 rounded" contentEditable={false}>
        Empty diagram
      </div>
    );
  }

  if (error) {
    return (
      <pre className="my-1 p-2 text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded whitespace-pre-wrap" contentEditable={false}>
        {error}
      </pre>
    );
  }

  if (!preview) {
    return (
      <div className="my-1 p-3 text-sm text-muted-foreground" contentEditable={false}>
        Rendering…
      </div>
    );
  }

  return (
    <div
      contentEditable={false}
      className="my-1 w-full"
      style={{ lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: preview }}
    />
  );
}
