import { useState } from 'react';
import { saveReplay, type SavedReplay } from '../replay/storage';

interface SaveReplayButtonProps {
  /** 누를 때 저장할 내용을 만든다 */
  readonly entry: () => Omit<SavedReplay, 'id' | 'savedAt'>;
}

/** 결과 창의 리플레이 저장 버튼. 한 판에 한 번만 저장한다 */
export function SaveReplayButton({ entry }: SaveReplayButtonProps) {
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const label = status === 'saved' ? '리플레이 저장됨' : status === 'failed' ? '저장 실패 (저장 공간 확인)' : '리플레이 저장';
  return (
    <button type="button" className="btn btn-ghost" disabled={status === 'saved'} onClick={() => setStatus(saveReplay(entry()) ? 'saved' : 'failed')}>
      {label}
    </button>
  );
}
