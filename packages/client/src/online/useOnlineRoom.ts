import type { Action, Color } from '@hyperchess/engine';
import type {
  Ack,
  ChatMessage,
  ClientToServerEvents,
  ColorPreference,
  CreateRoomRequest,
  JoinResult,
  JoinRoomRequest,
  MatchRequest,
  RoomSnapshot,
  ServerToClientEvents,
} from '@hyperchess/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = 'hyperchess:online-session';
const ACK_TIMEOUT_MS = 8000;
/** 화면에 남겨 두는 채팅 줄 수 (서버는 보관하지 않는다) */
const CHAT_KEEP = 100;

interface StoredSession {
  readonly code: string;
  readonly token: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 재접속만 불가
  }
}

async function request<T>(call: () => Promise<Ack<T>>): Promise<T> {
  let result: Ack<T>;
  try {
    result = await call();
  } catch {
    throw new Error('서버 응답이 없습니다');
  }
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function useOnlineRoom() {
  const socketRef = useRef<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [you, setYou] = useState<Color | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(() => loadSession() !== null);
  /** 빠른 매칭 대기 중 */
  const [matching, setMatching] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const socket: GameSocket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', async () => {
      setConnected(true);
      const session = loadSession();
      if (!session) return;
      try {
        const result = await request(
          () => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:resume', session) as Promise<Ack<JoinResult>>,
        );
        setYou(result.color);
      } catch {
        saveSession(null);
        setSnapshot(null);
      } finally {
        setResuming(false);
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      // 연결이 끊기면 서버 대기열에서도 빠진다
      setMatching(false);
    });
    socket.on('room:state', (next, color) => {
      setSnapshot(next);
      setYou(color);
    });
    socket.on('chat:message', (message) => setMessages((list) => [...list, message].slice(-CHAT_KEEP)));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const run = useCallback(async <T,>(call: (socket: GameSocket) => Promise<Ack<T>>): Promise<T | null> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError('서버에 연결되어 있지 않습니다');
      return null;
    }
    try {
      setError(null);
      return await request(() => call(socket.timeout(ACK_TIMEOUT_MS) as unknown as GameSocket));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const enter = useCallback((result: JoinResult | null) => {
    if (!result) return;
    saveSession({ code: result.code, token: result.token });
    setYou(result.color);
    // 다른 방으로 들어가면 지난 대화는 남기지 않는다
    setMessages([]);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onFound = (result: JoinResult) => {
      setMatching(false);
      enter(result);
    };
    socket.on('match:found', onFound);
    return () => {
      socket.off('match:found', onFound);
    };
  }, [enter]);

  return {
    connected,
    resuming,
    snapshot,
    you,
    error,
    clearError: () => setError(null),
    create: async (req: CreateRoomRequest) => enter(await run((s) => s.emitWithAck('room:create', req))),
    join: async (req: JoinRoomRequest) => enter(await run((s) => s.emitWithAck('room:join', req))),
    matching,
    findMatch: async (req: MatchRequest) => {
      const result = await run((s) => s.emitWithAck('match:find', req));
      // 바로 짝이 지어졌으면 match:found가 이미 처리한다
      if (result && !result.matched) setMatching(true);
    },
    cancelMatch: () => {
      socketRef.current?.emit('match:cancel');
      setMatching(false);
    },
    messages,
    sendChat: (text: string) => run((s) => s.emitWithAck('chat:send', text)),
    setAbility: (abilityId: string) => run((s) => s.emitWithAck('room:ability', abilityId)),
    setReady: (ready: boolean) => run((s) => s.emitWithAck('room:ready', ready)),
    setColor: (color: ColorPreference) => run((s) => s.emitWithAck('room:color', color)),
    act: (action: Action) => run((s) => s.emitWithAck('game:action', action)),
    resign: () => run((s) => s.emitWithAck('game:resign')),
    rematch: () => run((s) => s.emitWithAck('game:rematch')),
    leave: () => {
      socketRef.current?.emit('room:leave');
      saveSession(null);
      setSnapshot(null);
      setYou(null);
      setMessages([]);
    },
  };
}

export type OnlineRoom = ReturnType<typeof useOnlineRoom>;
