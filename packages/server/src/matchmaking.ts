import type { MatchRequest } from '@hyperchess/protocol';
import type { SeatIdentity } from './rooms';

export interface MatchTicket {
  readonly socketId: string;
  readonly request: MatchRequest;
  readonly identity: SeatIdentity | null;
}

/** 빠른 매칭 대기열: 먼저 기다린 사람부터 짝을 지어 준다 */
export class Matchmaker {
  private queue: MatchTicket[] = [];

  /** 짝이 있으면 대기열에서 꺼내 돌려주고, 없으면 대기열에 넣고 null */
  enqueue(ticket: MatchTicket): MatchTicket | null {
    this.cancel(ticket.socketId);
    const index = this.queue.findIndex((other) => !isSameAccount(other, ticket));
    if (index === -1) {
      this.queue.push(ticket);
      return null;
    }
    const [partner] = this.queue.splice(index, 1);
    return partner;
  }

  /** 대기 중이었으면 true */
  cancel(socketId: string): boolean {
    const before = this.queue.length;
    this.queue = this.queue.filter((ticket) => ticket.socketId !== socketId);
    return this.queue.length !== before;
  }

  get size(): number {
    return this.queue.length;
  }
}

/** 같은 계정끼리(다른 탭 등)는 매칭하지 않는다 */
const isSameAccount = (a: MatchTicket, b: MatchTicket) => !!a.identity && !!b.identity && a.identity.userId === b.identity.userId;
