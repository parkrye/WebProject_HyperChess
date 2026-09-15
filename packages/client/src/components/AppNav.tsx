import { createContext, useContext } from 'react';

export interface AppNav {
  /** 현재 페이지 종류 (상단 바에서 활성 표시) */
  readonly current: string;
  readonly openRanking: () => void;
  readonly openStats: () => void;
}

export const AppNavContext = createContext<AppNav | null>(null);

export const useAppNav = () => useContext(AppNavContext);
