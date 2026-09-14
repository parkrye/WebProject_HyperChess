import type { Board } from '@hyperchess/engine';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Overlay, OverlaySpec, PieceFx, ScreenFx, Stage } from '../effects/types';

export interface StageView {
  readonly board: Board | null;
  readonly overlays: readonly Overlay[];
  readonly pieceFx: Readonly<Record<string, PieceFx>>;
  readonly screenFx: ScreenFx | null;
}

export function useStage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [pieceFx, setPieceFx] = useState<Record<string, PieceFx>>({});
  const [screenFx, setScreenFx] = useState<ScreenFx | null>(null);
  const nextId = useRef(0);

  const api = useMemo<Stage>(
    () => ({
      showBoard: (next) => setBoard(next),
      overlay: (spec: OverlaySpec) => {
        const overlay: Overlay = { ...spec, id: nextId.current++ };
        setOverlays((list) => [...list, overlay]);
        window.setTimeout(() => setOverlays((list) => list.filter((o) => o.id !== overlay.id)), spec.duration);
      },
      pieceFx: (pieceId, fx) =>
        setPieceFx((map) => {
          const next = { ...map };
          if (fx) next[pieceId] = fx;
          else delete next[pieceId];
          return next;
        }),
      screen: (fx) => setScreenFx(fx),
      wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    }),
    [],
  );

  const reset = useCallback(() => {
    setBoard(null);
    setOverlays([]);
    setPieceFx({});
    setScreenFx(null);
  }, []);

  const view: StageView = { board, overlays, pieceFx, screenFx };
  return { api, view, reset };
}
