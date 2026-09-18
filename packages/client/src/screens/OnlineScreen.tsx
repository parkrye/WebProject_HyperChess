import { type Action, type Color, type GameState } from '@hyperchess/engine';
import { NAME_MAX_LENGTH, RANDOM_ABILITY, ROOM_CODE_LENGTH, type RoomSnapshot } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { abilityName, COLOR_NAME } from '../abilityUi/text';
import { AbilityPicker } from '../components/AbilityPicker';
import { AbilityReveal } from '../components/AbilityReveal';
import { GameView } from '../components/GameView';
import { Page } from '../components/Page';
import { useBgm } from '../audio/bgm';
import { useAnimatedGame } from '../game/useAnimatedGame';
import { useOnlineRoom, type OnlineRoom } from '../online/useOnlineRoom';
import { useSession } from '../auth/session';

const PREFS_KEY = 'hyperchess:online-prefs';

interface Prefs {
  name: string;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    // 기본값 사용
  }
  return { name: '' };
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 무시
  }
}

const roomFromUrl = () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';

function setUrlRoom(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

interface OnlineScreenProps {
  readonly onBack: () => void;
  /** 매칭 대기 중 싱글 플레이 권유를 수락했을 때 */
  readonly onSingle: () => void;
}

export function OnlineScreen({ onBack, onSingle }: OnlineScreenProps) {
  const room = useOnlineRoom();
  const { snapshot, you } = room;

  useEffect(() => {
    if (snapshot) setUrlRoom(snapshot.code);
  }, [snapshot?.code]);

  const leave = () => {
    room.leave();
    setUrlRoom(null);
  };

  if (snapshot && you) {
    if (!snapshot.game) return <WaitingRoom room={room} snapshot={snapshot} you={you} onLeave={leave} />;
    return <OnlineGame key={`${snapshot.code}-${you}`} room={room} snapshot={snapshot} game={snapshot.game} you={you} onLeave={leave} />;
  }

  return <Lobby room={room} onBack={onBack} onSingle={onSingle} />;
}

/* ---------- 로비 ---------- */

function Lobby({ room, onBack, onSingle }: { room: OnlineRoom } & OnlineScreenProps) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [code, setCode] = useState(roomFromUrl);
  const [pending, setPending] = useState(false);
  const { session } = useSession();
  const account = session?.kind === 'user' ? session : null;

  const update = (patch: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });

  // 로그인 유저는 세션 토큰으로 참가해 닉네임·레이팅이 쓰인다. 색·능력은 대기실에서 정한다
  const base = { name: prefs.name, ...(account ? { authToken: account.token } : {}) };

  const submit = async (kind: 'create' | 'join') => {
    setPending(true);
    if (room.matching) room.cancelMatch();
    if (kind === 'create') await room.create(base);
    else await room.join({ ...base, code });
    setPending(false);
  };

  const disabled = pending || !room.connected || room.resuming;
  const status = room.error ?? (room.resuming ? '이전 방에 다시 연결하는 중…' : !room.connected ? '서버에 연결하는 중…' : null);
  useBgm('lobby');

  return (
    <Page title="멀티" onBack={onBack}>
      <p className={`notice notice-slot ${status ? '' : 'is-empty'} ${room.error ? 'notice-error' : ''}`} role="status">
        {status ?? '\u00a0'}
      </p>

      <section className="online-form">
        <label className="field">
          <span>이름</span>
          {account ? (
            <strong>{account.user.nickname}</strong>
          ) : (
            <input
              value={prefs.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="게스트"
              onChange={(e) => update({ name: e.target.value })}
            />
          )}
        </label>

        <QuickMatch room={room} disabled={disabled} onFind={() => void room.findMatch(base)} onSingle={onSingle} />

        <div className="online-actions">
          <div className="online-card">
            <h3>방 만들기</h3>
            <p className="online-card-hint">색과 능력은 방 안에서 정합니다</p>
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => submit('create')}>
              방 만들기
            </button>
          </div>

          <div className="online-card">
            <h3>코드로 참가</h3>
            <input
              className="code-input"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABCDE"
              aria-label="방 코드"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button type="button" className="btn btn-primary" disabled={disabled || code.length !== ROOM_CODE_LENGTH} onClick={() => submit('join')}>
              참가
            </button>
          </div>
        </div>
      </section>
    </Page>
  );
}

/* ---------- 빠른 매칭 ---------- */

/** 이만큼 상대를 못 찾으면 싱글 플레이를 한 번 권한다 (대기 한 번에 한 번만) */
const MATCH_SUGGEST_MS = 30_000;

const formatElapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

interface QuickMatchProps {
  readonly room: OnlineRoom;
  readonly disabled: boolean;
  readonly onFind: () => void;
  readonly onSingle: () => void;
}

function QuickMatch({ room, disabled, onFind, onSingle }: QuickMatchProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [suggest, setSuggest] = useState(false);
  const { matching } = room;

  useEffect(() => {
    setElapsedMs(0);
    setSuggest(false);
    if (!matching) return;
    const startedAt = Date.now();
    let suggested = false;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (suggested || elapsed < MATCH_SUGGEST_MS) return;
      suggested = true;
      setSuggest(true);
    }, 250);
    return () => window.clearInterval(timer);
  }, [matching]);

  const goSingle = () => {
    room.cancelMatch();
    onSingle();
  };

  return (
    <div className="online-card quick-match">
      <h3>빠른 매칭</h3>
      {/* 대기 전후로 같은 구조를 유지해 높이가 변하지 않게 한다 */}
      <p className={`quick-match-status ${matching ? '' : 'is-hidden'}`} aria-live="polite">
        {matching ? `상대를 찾는 중… ${formatElapsed(elapsedMs)}` : '\u00a0'}
      </p>
      {matching ? (
        <button type="button" className="btn btn-ghost" onClick={room.cancelMatch}>
          매칭 취소
        </button>
      ) : (
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onFind}>
          대국 찾기
        </button>
      )}

      {suggest && matching && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-label="싱글 플레이 권유">
            <h2>싱글 플레이를 할까요?</h2>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={goSingle}>
                싱글 플레이로
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setSuggest(false)}>
                계속 기다리기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 대기실 ---------- */

interface WaitingRoomProps {
  readonly room: OnlineRoom;
  readonly snapshot: RoomSnapshot;
  readonly you: Color;
  readonly onLeave: () => void;
}

/**
 * 대기실: 색(방장)과 능력(각자)을 정하고 준비한다.
 * 방장이 있는 방은 방장이 시작을 누르고, 빠른 매칭 방(방장 없음)은 양쪽이 준비하면 저절로 시작한다.
 */
function WaitingRoom({ room, snapshot, you, onLeave }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  useBgm('lobby');
  const link = `${window.location.origin}${window.location.pathname}?room=${snapshot.code}`;

  const mySeat = snapshot.seats[you];
  const opponent = snapshot.seats[you === 'w' ? 'b' : 'w'];
  const isHost = snapshot.hostColor === you;
  const ready = mySeat?.ready ?? false;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Page title="대기실" onBack={onLeave} backLabel="나가기">
      <p className={`notice notice-slot ${room.error ? 'notice-error' : 'is-empty'}`} role="status">
        {room.error ?? ' '}
      </p>

      <section className="waiting-card">
        <div className="room-code">{snapshot.code}</div>
        <button type="button" className="btn" onClick={copy}>
          {copied ? '링크 복사됨' : '초대 링크 복사'}
        </button>
        <ul className="seat-list">
          {(['w', 'b'] as const).map((color) => {
            const seat = snapshot.seats[color];
            return (
              <li key={color}>
                <span className={`player-dot dot-${color}`} />
                {seat ? (
                  <>
                    <strong>{seat.name}</strong>
                    {color === you && <span className="seat-tag">나</span>}
                    {color === snapshot.hostColor && <span className="seat-tag">방장</span>}
                    <span className="seat-ability">{abilityName(seat.abilityId)}</span>
                    <span className={`seat-ready ${seat.ready ? 'is-ready' : ''}`}>{seat.ready ? '준비 완료' : '준비 전'}</span>
                  </>
                ) : (
                  <span className="seat-empty">대기 중</span>
                )}
              </li>
            );
          })}
        </ul>

        {isHost && (
          <div className="segmented" role="radiogroup" aria-label="내 색">
            {(['w', 'b'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={you === value}
                className={you === value ? 'active' : ''}
                onClick={() => void room.setColor(value)}
              >
                {COLOR_NAME[value]}
              </button>
            ))}
          </div>
        )}

        {isHost ? (
          <button type="button" className="btn btn-primary" disabled={!opponent?.ready} onClick={() => void room.start()}>
            {!opponent ? '상대를 기다리는 중' : opponent.ready ? '게임 시작' : '상대 준비 대기 중'}
          </button>
        ) : (
          <button type="button" className={`btn ${ready ? 'btn-ghost' : 'btn-primary'}`} onClick={() => void room.setReady(!ready)}>
            {ready ? '준비 취소' : '준비'}
          </button>
        )}
      </section>

      <AbilityPicker
        label="내 능력 선택"
        showDetail={false}
        selected={mySeat?.abilityId ?? RANDOM_ABILITY}
        disabled={ready}
        onSelect={(abilityId) => void room.setAbility(abilityId)}
      />
    </Page>
  );
}

/* ---------- 대국 ---------- */

/** 이름 옆에 레이팅 (게스트는 이름만) */
function seatName(snapshot: RoomSnapshot, color: Color) {
  const seat = snapshot.seats[color];
  if (!seat) return COLOR_NAME[color];
  return seat.rating === null ? seat.name : `${seat.name} (${seat.rating})`;
}

interface OnlineGameProps {
  readonly room: OnlineRoom;
  readonly snapshot: RoomSnapshot;
  readonly game: GameState;
  readonly you: Color;
  readonly onLeave: () => void;
}

function OnlineGame({ room, snapshot, game, you, onLeave }: OnlineGameProps) {
  const animated = useAnimatedGame(game);
  const { present } = animated;
  const [sending, setSending] = useState(false);
  // 서버 시각과 로컬 시각의 차이 (스냅샷을 받은 시점 기준)
  const clockOffsetMs = useMemo(() => snapshot.serverTime - Date.now(), [snapshot]);
  const randomized = { w: snapshot.seats.w?.randomized ?? false, b: snapshot.seats.b?.randomized ?? false };
  // 새 게임(아직 수를 두기 전)에 무작위 능력이 있으면 한 번 공개한다
  const [revealDone, setRevealDone] = useState(() => !((randomized.w || randomized.b) && game.log.length === 0));
  const finishReveal = useCallback(() => setRevealDone(true), []);

  useEffect(() => {
    void present(game);
  }, [game, present]);

  // 대국이 끝나면 바뀐 레이팅을 받아 온다
  const { refresh } = useSession();
  const finished = game.result.kind !== 'ongoing';
  useEffect(() => {
    if (finished) void refresh();
  }, [finished, refresh]);

  const dispatch = async (action: Action) => {
    if (sending) return;
    setSending(true);
    await room.act(action);
    setSending(false);
  };

  const opponent = snapshot.seats[you === 'w' ? 'b' : 'w'];
  const seats = {
    w: { name: seatName(snapshot, 'w'), connected: snapshot.seats.w?.connected ?? false, isMe: you === 'w' },
    b: { name: seatName(snapshot, 'b'), connected: snapshot.seats.b?.connected ?? false, isMe: you === 'b' },
  };
  const votedRematch = snapshot.rematchVotes.includes(you);
  const opponentVoted = snapshot.rematchVotes.some((c) => c !== you);

  const confirmResign = () => {
    if (window.confirm('기권하시겠습니까?')) void room.resign();
  };

  const notice = room.error ?? (!room.connected ? '서버와 연결이 끊겼습니다. 재연결 중…' : opponent && !opponent.connected ? '상대의 연결이 끊겼습니다. 재접속을 기다리는 중…' : null);

  return (
    <>
      <GameView
        state={animated.state}
        busy={animated.busy || sending}
        stageView={animated.stageView}
        dispatch={(action) => void dispatch(action)}
        myColor={you}
        seats={seats}
        clockOffsetMs={clockOffsetMs}
        randomized={randomized}
        onMenu={onLeave}
        notice={notice}
        sidebar={
          <div className="room-info">
            <span>
              방 코드 <strong>{snapshot.code}</strong>
            </span>
            {snapshot.status === 'playing' && (
              <button type="button" className="btn btn-ghost" onClick={confirmResign}>
                기권
              </button>
            )}
          </div>
        }
        resultActions={
          <>
            <button type="button" className="btn btn-primary" disabled={votedRematch || !opponent?.connected} onClick={() => void room.rematch()}>
              {votedRematch ? '상대 응답 대기 중' : opponentVoted ? '재대결 수락' : '재대결 신청'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onLeave}>
              나가기
            </button>
          </>
        }
      />
      {!revealDone && (
        <AbilityReveal
          abilities={{ w: game.players.w.abilityId ?? '', b: game.players.b.abilityId ?? '' }}
          randomized={randomized}
          names={{ w: seats.w.name, b: seats.b.name }}
          onDone={finishReveal}
        />
      )}
    </>
  );
}
