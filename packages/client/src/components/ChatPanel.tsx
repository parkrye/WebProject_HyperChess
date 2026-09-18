import type { Color } from '@hyperchess/engine';
import { CHAT_MAX_LENGTH, type ChatMessage } from '@hyperchess/protocol';
import { useEffect, useRef, useState } from 'react';

interface ChatPanelProps {
  readonly messages: readonly ChatMessage[];
  /** 내 색 (내 말풍선을 구분한다) */
  readonly you: Color;
  readonly onSend: (text: string) => void;
}

/** 방 채팅. 서버가 보관하지 않아 이 화면을 떠나면 사라진다 */
export function ChatPanel({ messages, you, onSend }: ChatPanelProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 오면 항상 마지막 줄이 보이게 한다
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    onSend(trimmed);
  };

  return (
    <section className="chat-panel" aria-label="채팅">
      <div className="chat-log" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="chat-empty">상대와 대화할 수 있어요</p>
        ) : (
          messages.map((message) => (
            <p key={message.id} className={`chat-line ${message.color === you ? 'is-me' : ''}`}>
              <span className={`player-dot dot-${message.color}`} />
              <strong>{message.name}</strong>
              <span className="chat-text">{message.text}</span>
            </p>
          ))
        )}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="메시지 입력"
          aria-label="메시지"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={text.trim().length === 0}>
          보내기
        </button>
      </form>
    </section>
  );
}
