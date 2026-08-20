import { useController, Control } from 'react-hook-form';
import { RichTextEditor } from './rich-text-editor';

interface FormRichTextProps {
  name: string;
  control: Control<any>;
  placeholder?: string;
  className?: string;
}

export function FormRichText({ name, control, placeholder, className }: FormRichTextProps) {
  const {
    field: { value, onChange },
  } = useController({
    name,
    control,
    defaultValue: '',
  });

  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  );
}