import type * as Party from "partykit/server";

type Choice = "A" | "B";
type Phase = "voting" | "revealed";

export default class GameServer implements Party.Server {
  hostId: string | null = null;
  scenarioIdx = 0;
  phase: Phase = "voting";
  votes = new Map<string, Choice>();
  // ▸ optional scoring would live here:
  // scores = new Map<string, number>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    if (!this.hostId) this.hostId = conn.id;
    conn.send(
      JSON.stringify({
        type: "init",
        role: conn.id === this.hostId ? "host" : "player",
        scenarioIdx: this.scenarioIdx,
        phase: this.phase,
        tally: this.tally(),
        yourVote: this.votes.get(conn.id) ?? null,
      }),
    );
  }

  onMessage(raw: string, sender: Party.Connection) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "vote" && this.phase === "voting") {
      if (msg.choice !== "A" && msg.choice !== "B") return;
      this.votes.set(sender.id, msg.choice);
      this.broadcastTally();
      return;
    }

    if (sender.id !== this.hostId) return; // host-only past this point

    if (msg.type === "advance") {
      if (this.phase === "voting") {
        this.phase = "revealed";
        // ▸ optional scoring: award points based on majority pick here
      } else {
        this.scenarioIdx++;
        this.phase = "voting";
        this.votes.clear();
      }
      this.broadcastState();
    } else if (msg.type === "restart") {
      this.scenarioIdx = 0;
      this.phase = "voting";
      this.votes.clear();
      this.broadcastState();
    }
  }

  onClose(conn: Party.Connection) {
    this.votes.delete(conn.id);
    if (conn.id === this.hostId) {
      const remaining = [...this.room.getConnections()];
      this.hostId = remaining[0]?.id ?? null;
      if (this.hostId) {
        this.room
          .getConnection(this.hostId)
          ?.send(JSON.stringify({ type: "role", role: "host" }));
      }
    }
    this.broadcastTally();
  }

  private tally() {
    let A = 0, B = 0;
    for (const v of this.votes.values()) v === "A" ? A++ : B++;
    return { A, B, total: A + B };
  }

  private broadcastTally() {
    this.room.broadcast(
      JSON.stringify({ type: "tally", tally: this.tally() }),
    );
  }

  private broadcastState() {
    this.room.broadcast(
      JSON.stringify({
        type: "state",
        scenarioIdx: this.scenarioIdx,
        phase: this.phase,
        tally: this.tally(),
      }),
    );
  }
}
