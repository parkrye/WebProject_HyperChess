import { useEffect, useSyncExternalStore } from 'react';

export type BgmTrack = 'title' | 'lobby' | 'battle' | 'tension' | 'victory' | 'defeat';

const LOOPING: Readonly<Record<BgmTrack, boolean>> = {
  title: true,
  lobby: true,
  battle: true,
  tension: true,
  victory: false,
  defeat: false,
};

const VOLUME = 0.45;
const FADE_MS = 900;
const FADE_STEP_MS = 50;
const MUTE_KEY = 'hyperchess:bgm-muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 배경음악 재생기 (앱 전체에서 하나).
 * 화면은 원하는 곡만 요청하고, 실제 전환(크로스페이드)·자동재생 해제·음소거는 여기서 처리한다.
 */
class BgmPlayer {
  private readonly audios = new Map<BgmTrack, HTMLAudioElement>();
  private readonly fades = new Map<HTMLAudioElement, number>();
  private readonly listeners = new Set<() => void>();
  private desired: BgmTrack | null = null;
  private current: BgmTrack | null = null;
  private unlocked = false;
  private muted = readMuted();

  constructor() {
    if (typeof window === 'undefined') return;
    // 브라우저 자동재생 정책: 첫 사용자 입력 이후에만 소리를 낼 수 있다
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.apply();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  request(track: BgmTrack | null) {
    if (this.desired === track) return;
    this.desired = track;
    this.apply();
  }

  isMuted = () => this.muted;

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 저장 실패는 무시
    }
    this.apply();
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private audio(track: BgmTrack): HTMLAudioElement {
    let audio = this.audios.get(track);
    if (!audio) {
      audio = new Audio(`/assets/bgm/${track}.mp3`);
      audio.loop = LOOPING[track];
      audio.preload = 'auto';
      audio.volume = 0;
      this.audios.set(track, audio);
    }
    return audio;
  }

  private apply() {
    if (!this.unlocked) return;
    const target = this.muted ? null : this.desired;

    if (this.current && this.current !== target) {
      const previous = this.audio(this.current);
      this.fade(previous, 0, () => previous.pause());
    }
    this.current = target;
    if (!target) return;

    const next = this.audio(target);
    if (next.ended || (!LOOPING[target] && next.currentTime > 0 && next.paused)) next.currentTime = 0;
    next.play().catch(() => {
      // 재생 실패(자동재생 차단 등)는 다음 사용자 입력 때 다시 시도된다
    });
    this.fade(next, VOLUME);
  }

  private fade(audio: HTMLAudioElement, to: number, done?: () => void) {
    window.clearInterval(this.fades.get(audio));
    const from = audio.volume;
    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      audio.volume = Math.min(1, Math.max(0, from + ((to - from) * step) / steps));
      if (step >= steps) {
        window.clearInterval(timer);
        this.fades.delete(audio);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(audio, timer);
  }
}

export const bgm = new BgmPlayer();

/** 컴포넌트가 화면에 있는 동안 원하는 배경음악을 요청한다 */
export function useBgm(track: BgmTrack | null) {
  useEffect(() => {
    bgm.request(track);
  }, [track]);
}

export function useBgmMuted(): [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(bgm.subscribe, bgm.isMuted, bgm.isMuted);
  return [muted, (next) => bgm.setMuted(next)];
}
