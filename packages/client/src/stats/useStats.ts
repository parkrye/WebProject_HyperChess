import type { ResultSource, StatsResponse } from '@hyperchess/protocol';
import { useEffect, useState } from 'react';

export type StatsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly data: StatsResponse };

async function fetchStats(sources: readonly ResultSource[], version: number | null, signal: AbortSignal): Promise<StatsResponse> {
  const params = new URLSearchParams();
  if (sources.length) params.set('source', sources.join(','));
  if (version !== null) params.set('version', String(version));
  const response = await fetch(`/api/stats?${params}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`stats ${response.status}`);
  return (await response.json()) as StatsResponse;
}

/** 서버의 대국 통계를 불러온다 (필터가 바뀌면 다시 요청) */
export function useStats(sources: readonly ResultSource[], version: number | null): StatsState {
  const [state, setState] = useState<StatsState>({ status: 'loading' });
  const sourceKey = sources.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    const load = async () => {
      try {
        const data = await fetchStats(sourceKey ? (sourceKey.split(',') as ResultSource[]) : [], version, controller.signal);
        setState({ status: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    };
    void load();
    return () => controller.abort();
  }, [sourceKey, version]);

  return state;
}
