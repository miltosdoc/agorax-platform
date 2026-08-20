import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder = "Write something...", className = "" }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // If the value changes externally, update the editor
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run();
  }, [editor]);

  const toggleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run();
  }, [editor]);

  return (
    <div className={`rich-text-editor border rounded-md ${className}`}>
      <div className="flex items-center p-2 border-b">
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={toggleBold}
          className={`${editor?.isActive('bold') ? 'bg-accent text-accent-foreground' : ''}`}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={toggleItalic}
          className={`${editor?.isActive('italic') ? 'bg-accent text-accent-foreground' : ''}`}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={toggleBulletList}
          className={`${editor?.isActive('bulletList') ? 'bg-accent text-accent-foreground' : ''}`}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={toggleOrderedList}
          className={`${editor?.isActive('orderedList') ? 'bg-accent text-accent-foreground' : ''}`}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent 
        editor={editor} 
        className="prose prose-sm max-w-none p-3 min-h-[150px] focus:outline-none" 
      />
    </div>
  );
}