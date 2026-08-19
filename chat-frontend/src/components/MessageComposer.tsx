import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface MessageComposerProps {
  disabled: boolean;
  pending: boolean;
  onSend: (content: string) => Promise<boolean>;
}

export function MessageComposer({ disabled, pending, onSend }: MessageComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const blocked = disabled || pending || submittingRef.current;

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    resize();
  }, [text]);

  const submit = async () => {
    if (blocked || submittingRef.current) return;
    const value = text.trim();
    if (!value) return;
    submittingRef.current = true;
    try {
      const sent = await onSend(value);
      if (sent) setText('');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer-box">
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          maxLength={10000}
          placeholder="Write a message…"
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
        />
        <button
          type="button"
          className="btn btn--primary send-button"
          onClick={() => void submit()}
          disabled={blocked || !text.trim()}
          aria-label={pending ? 'Sending message' : 'Send message'}
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}
