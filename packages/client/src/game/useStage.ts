import type { Board } from '@hyperchess/engine';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { Overlay, OverlaySpec, PieceFx, ScreenFx, Stage } from '../effects/types';

export interface StageView {
  readonly board: Board | null;
  readonly overlays: readonly Overlay[];
  readonly pieceFx: Readonly<Record<string, PieceFx>>;
  readonly screenFx: ScreenFx | null;
}

/** speed: 연출 배속 (2면 두 배 빠르게). 기본 1배 */
export function useStage(speed?: RefObject<number>) {
  const [board, setBoard] = useState<Board | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [pieceFx, setPieceFx] = useState<Record<string, PieceFx>>({});
  const [screenFx, setScreenFx] = useState<ScreenFx | null>(null);
  const nextId = useRef(0);
  const scale = (ms: number) => ms / Math.max(1, speed?.current ?? 1);

  const api = useMemo<Stage>(
    () => ({
      showBoard: (next) => setBoard(next),
      overlay: (spec: OverlaySpec) => {
        const overlay: Overlay = { ...spec, duration: scale(spec.duration), id: nextId.current++ };
        setOverlays((list) => [...list, overlay]);
        window.setTimeout(() => setOverlays((list) => list.filter((o) => o.id !== overlay.id)), overlay.duration);
      },
      pieceFx: (pieceId, fx) =>
        setPieceFx((map) => {
          const next = { ...map };
          if (fx) next[pieceId] = fx;
          else delete next[pieceId];
          return next;
        }),
      screen: (fx) => setScreenFx(fx),
      wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, scale(ms))),
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
