import { getAbility, type Action, type Color, type GameState } from '@hyperchess/engine';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, type ColorPreference, type RoomSnapshot } from '@hyperchess/protocol';
import { useEffect, useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME } from '../abilityUi/text';
import { AbilityGrid } from '../components/AbilityGrid';
import { AbilityIconView } from '../components/AbilityIconView';
import { GameView } from '../components/GameView';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';
import { useAnimatedGame } from '../game/useAnimatedGame';
import { useOnlineRoom, type OnlineRoom } from '../online/useOnlineRoom';

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

  const update = (patch: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });

  const submit = async (kind: 'create' | 'join') => {
    setPending(true);
    const base = { name: prefs.name, abilityId: prefs.abilityId };
    if (kind === 'create') await room.create({ ...base, color });
    else await room.join({ ...base, code });
    setPending(false);
  };

  const spec = abilityUi(prefs.abilityId);
  const disabled = pending || !room.connected || room.resuming;

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
          <input
            value={prefs.name}
            maxLength={NAME_MAX_LENGTH}
            placeholder="플레이어"
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>

        <div className="field">
          <span>내 능력</span>
          <strong className="chosen-ability" style={{ '--ability-color': spec.color } as CSSProperties}>
            <AbilityIconView icon={spec.icon} size={18} />
            {getAbility(prefs.abilityId).name}
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
                    {color === you && <span className="seat-tag">나</span>}
                    <span className="seat-ability">{getAbility(seat.abilityId).name}</span>
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

  useEffect(() => {
    void present(game);
  }, [game, present]);

  const dispatch = async (action: Action) => {
    if (sending) return;
    setSending(true);
    await room.act(action);
    setSending(false);
  };

  const opponent = snapshot.seats[you === 'w' ? 'b' : 'w'];
  const seats = {
    w: { name: snapshot.seats.w?.name ?? COLOR_NAME.w, connected: snapshot.seats.w?.connected ?? false, isMe: you === 'w' },
    b: { name: snapshot.seats.b?.name ?? COLOR_NAME.b, connected: snapshot.seats.b?.connected ?? false, isMe: you === 'b' },
  };
  const votedRematch = snapshot.rematchVotes.includes(you);
  const opponentVoted = snapshot.rematchVotes.some((c) => c !== you);

  const confirmResign = () => {
    if (window.confirm('기권하시겠습니까?')) void room.resign();
  };

  const notice = room.error ?? (!room.connected ? '서버와 연결이 끊겼습니다. 재연결 중…' : opponent && !opponent.connected ? '상대의 연결이 끊겼습니다. 재접속을 기다리는 중…' : null);

  return (
    <GameView
      state={animated.state}
      busy={animated.busy || sending}
      stageView={animated.stageView}
      dispatch={(action) => void dispatch(action)}
      myColor={you}
      seats={seats}
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
  );
}
