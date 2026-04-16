import { useState, useRef, useEffect } from 'preact/hooks';

export function useInlineEdit(currentValue, onSave) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const newValue = inputRef.current?.value.trim();
    if (newValue && newValue !== currentValue) {
      onSave(newValue);
    }
    setEditing(false);
  };

  const inputProps = {
    ref: inputRef,
    type: "text",
    value: currentValue,
    size: Math.max(1, currentValue.length),
    onInput: (e) => { e.target.size = Math.max(1, e.target.value.length); },
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { e.target.value = currentValue; e.target.blur(); }
    },
  };

  return { editing, setEditing, inputProps };
}
