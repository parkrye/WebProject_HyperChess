import { type Action, type Color, type GameState } from '@hyperchess/engine';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, type ColorPreference, type RoomSnapshot } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityName, COLOR_NAME } from '../abilityUi/text';
import { AbilityGrid } from '../components/AbilityGrid';
import { AbilityReveal } from '../components/AbilityReveal';
import { AbilityIconView } from '../components/AbilityIconView';
import { GameView } from '../components/GameView';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';
import { useBgm } from '../audio/bgm';
import { useAnimatedGame } from '../game/useAnimatedGame';
import { useOnlineRoom, type OnlineRoom } from '../online/useOnlineRoom';
import { useSession } from '../auth/session';

const PREFS_KEY = 'hyperchess:online-prefs';

interface Prefs {
  name: string;
  abilityId: string;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    // 기본값 사용
  }
  return { name: '', abilityId: 'telekinesis' };
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

export function OnlineScreen({ onModeChange }: { onModeChange: (mode: GameMode) => void }) {
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
    if (!snapshot.game) return <WaitingRoom snapshot={snapshot} you={you} onLeave={leave} />;
    return <OnlineGame key={`${snapshot.code}-${you}`} room={room} snapshot={snapshot} game={snapshot.game} you={you} onLeave={leave} />;
  }

  return <Lobby room={room} onModeChange={onModeChange} />;
}

/* ---------- 로비 ---------- */

function Lobby({ room, onModeChange }: { room: OnlineRoom; onModeChange: (mode: GameMode) => void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [color, setColor] = useState<ColorPreference>('random');
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

  const submit = async (kind: 'create' | 'join') => {
    setPending(true);
    // 로그인 유저는 세션 토큰으로 참가해 닉네임·레이팅이 쓰인다
    const base = { name: prefs.name, abilityId: prefs.abilityId, ...(account ? { authToken: account.token } : {}) };
    if (kind === 'create') await room.create({ ...base, color });
    else await room.join({ ...base, code });
    setPending(false);
  };

  const spec = abilityUi(prefs.abilityId);
  const disabled = pending || !room.connected || room.resuming;
  useBgm('lobby');

  return (
    <main className="setup">
      <Hero />
      <ModeTabs active="online" onChange={onModeChange} />

      <div className="online-status">
        <span className={`conn-dot ${room.connected ? 'on' : ''}`} />
        {room.resuming ? '이전 방에 다시 연결하는 중…' : room.connected ? '서버 연결됨' : '서버에 연결하는 중…'}
      </div>
      {room.error && <p className="notice notice-error">{room.error}</p>}

      <section className="online-form">
        <label className="field">
          <span>이름</span>
          {account ? (
            <strong>
              {account.user.nickname} <small className="rating-tag">레이팅 {account.user.rating}</small>
            </strong>
          ) : (
            <input
              value={prefs.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="게스트 (랭킹 미반영)"
              onChange={(e) => update({ name: e.target.value })}
            />
          )}
        </label>

        <div className="field">
          <span>내 능력</span>
          <strong className="chosen-ability" style={{ '--ability-color': spec.color } as CSSProperties}>
            <AbilityIconView icon={spec.icon} size={18} />
            {abilityName(prefs.abilityId)}
          </strong>
        </div>

        <div className="online-actions">
          <div className="online-card">
            <h3>방 만들기</h3>
            <div className="segmented" role="radiogroup" aria-label="내 색">
              {(['random', 'w', 'b'] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={color === value} className={color === value ? 'active' : ''} onClick={() => setColor(value)}>
                  {value === 'random' ? '무작위' : COLOR_NAME[value]}
                </button>
              ))}
            </div>
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

      <AbilityGrid label="내 능력 선택" selected={prefs.abilityId} onSelect={(abilityId) => update({ abilityId })} />
    </main>
  );
}

/* ---------- 대기실 ---------- */

function WaitingRoom({ snapshot, you, onLeave }: { snapshot: RoomSnapshot; you: Color; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  useBgm('lobby');
  const link = `${window.location.origin}${window.location.pathname}?room=${snapshot.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="setup waiting">
      <Hero />
      <section className="waiting-card">
        <p>친구에게 방 코드를 알려주세요</p>
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
                    <small className="rating-tag">{seat.rating ?? '게스트'}</small>
                    {color === you && <span className="seat-tag">나</span>}
                    <span className="seat-ability">{abilityName(seat.abilityId)}</span>
                  </>
                ) : (
                  <span className="seat-empty">상대를 기다리는 중…</span>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          방 나가기
        </button>
      </section>
    </main>
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
