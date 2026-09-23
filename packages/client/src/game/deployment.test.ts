import { draftError } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { AI_DRAFT_PRESETS, presetPlacement } from './deployment';

describe('AI 징병 편성', () => {
  it('모든 후보가 양쪽 색에서 규칙에 맞다', () => {
    for (const rows of AI_DRAFT_PRESETS) {
      expect(draftError('w', presetPlacement('w', rows))).toBeNull();
      expect(draftError('b', presetPlacement('b', rows))).toBeNull();
    }
  });
});
