import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, type BlockNoteEditor, type DefaultBlockSchema, type DefaultInlineContentSchema, type DefaultStyleSchema } from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';
import { createReactBlockSpec } from '@blocknote/react';
import { marked } from 'marked';
import { ScratchpadBlockComponent } from './ScratchpadBlock';
import { MermaidBlockComponent } from './MermaidBlock';

// Convert markdown to HTML using marked (same approach as Docmost)
function markdownToHtml(md: string): string {
  // Strip YAML front matter if present
  const stripped = md.replace(/^\s*---[\s\S]*?---\s*/, '').trimStart();
  return marked.parse(stripped, { breaks: true }) as string;
}

type PasteHandlerContext = {
  event: ClipboardEvent;
  editor: BlockNoteEditor<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema>;
  defaultPasteHandler: (context?: { prioritizeMarkdownOverHTML?: boolean; plainTextAsMarkdown?: boolean }) => boolean | undefined;
};

// Paste markdown by converting it to HTML first (via marked), then inserting as HTML.
// This gives much better conversion quality than BlockNote's built-in markdown parser.
function pasteAsMarkdown(editor: BlockNoteEditor<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema>, text: string): void {
  editor.pasteHTML(markdownToHtml(text));
}

// Custom paste handler: converts pasted markdown to HTML via marked before inserting,
// identical in spirit to Docmost's MarkdownClipboard extension.
export const markdownPasteHandler = ({
  event,
  editor,
  defaultPasteHandler,
}: PasteHandlerContext): boolean | undefined => {
  const types = event.clipboardData?.types ?? [];

  // Skip conversion when pasting inside a code block
  const inCodeBlock = editor.getTextCursorPosition().block.type === 'codeBlock';
  if (inCodeBlock) return defaultPasteHandler();

  // VS Code copies markdown files with mode="markdown" in vscode-editor-data.
  // The default BlockNote handler wraps them in a code block — use HTML instead.
  if (types.includes('vscode-editor-data')) {
    try {
      const meta = JSON.parse(event.clipboardData!.getData('vscode-editor-data') || '{}');
      if (meta.mode === 'markdown') {
        const plain = event.clipboardData!.getData('text/plain');
        if (plain) { pasteAsMarkdown(editor, plain); return true; }
      }
    } catch { /* ignore */ }
  }

  // When clipboard has plain text, always try it as markdown
  // (covers: copying from text editors, terminals, markdown files, etc.)
  if (types.includes('text/plain') && !types.includes('blocknote/html')) {
    const plain = event.clipboardData!.getData('text/plain').trim();
    if (plain) {
      pasteAsMarkdown(editor, plain);
      return true;
    }
  }

  return defaultPasteHandler();
};

export const ScratchpadBlock = createReactBlockSpec(
  {
    type: 'scratchpad' as const,
    propSchema: {
      scratchpadId: { default: '' },
      title: { default: '' },
      previewHeight: { default: '200' },
      previewWidth: { default: '100' },  // percentage of container
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { scratchpadId, title, previewHeight, previewWidth } = props.block.props;
      return (
        <ScratchpadBlockComponent
          scratchpadId={scratchpadId}
          title={title}
          previewHeight={parseInt(previewHeight) || 200}
          previewWidth={parseInt(previewWidth) || 100}
          onSizeChange={(h, w) =>
            // Cast needed: updateBlock expects exact prop types but partial update is safe here
            props.editor.updateBlock(props.block, {
              props: { previewHeight: String(h), previewWidth: String(w) },
            } as Parameters<typeof props.editor.updateBlock>[1])
          }
        />
      );
    },
  }
);

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaid' as const,
    propSchema: {
      code: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => (
      <MermaidBlockComponent
        code={props.block.props.code}
        editor={props.editor}
        onChange={(code) =>
          // Cast needed: updateBlock expects exact prop types but partial update is safe here
          props.editor.updateBlock(props.block, { props: { code } } as Parameters<typeof props.editor.updateBlock>[1])
        }
      />
    ),
  }
);

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    mermaid: MermaidBlock(),
    scratchpad: ScratchpadBlock(),
  },
});
