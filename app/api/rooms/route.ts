import { randomInt } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { conditionCardFor } from "../../game-rules";

type RoomRow = {
  code: string;
  host_token: string;
  status: string;
  seed: number;
  round: number;
  current_turn: number;
  briefing_step: number;
  max_players: number;
  bunker_capacity: number;
};

type PlayerRow = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  seat: number;
  ready: number;
  eliminated: number;
};

type GlobalWithDb = typeof globalThis & { __bunkerDb?: DatabaseSync };

const colors = ["violet", "coral", "amber", "blue", "green", "violet", "coral", "amber", "blue", "green", "violet", "coral"];
const CATASTROPHE_COUNT = 100;
const EVOLVING_VIRUS_INDEX = 2;
const EVENT_COUNT = 10;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function getDb(): DatabaseSync {
  const globalDb = globalThis as GlobalWithDb;
  if (globalDb.__bunkerDb) return globalDb.__bunkerDb;

  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "bunker.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      host_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      seed INTEGER NOT NULL,
      round INTEGER NOT NULL DEFAULT 1,
      current_turn INTEGER NOT NULL DEFAULT 0,
      briefing_step INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER NOT NULL DEFAULT 8,
      bunker_capacity INTEGER NOT NULL DEFAULT 4,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      room_code TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL,
      seat INTEGER NOT NULL,
      ready INTEGER NOT NULL DEFAULT 0,
      eliminated INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_players_room_name ON room_players(room_code, name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_players_room_seat ON room_players(room_code, seat);
    CREATE TABLE IF NOT EXISTS room_reveals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      card_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_reveals_turn ON room_reveals(room_code, player_id, round);
    CREATE TABLE IF NOT EXISTS room_ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      choice TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_ballots_turn ON room_ballots(room_code, player_id, round);
    CREATE TABLE IF NOT EXISTS room_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_code, id);
    CREATE TABLE IF NOT EXISTS room_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      after_round INTEGER NOT NULL,
      event_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(room_code, after_round)
    );
    CREATE TABLE IF NOT EXISTS room_condition_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      target_player_id TEXT NOT NULL,
      condition_id TEXT NOT NULL,
      card_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(room_code, player_id)
    );
  `);

  // Railway may reuse a database created by an older version of the project.
  ensureColumn(db, "rooms", "briefing_step", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "rooms", "max_players", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "rooms", "bunker_capacity", "INTEGER NOT NULL DEFAULT 4");

  globalDb.__bunkerDb = db;
  return db;
}

function roomPayload(code: string) {
  const db = getDb();
  const room = db
    .prepare("SELECT code, host_token, status, seed, round, current_turn, briefing_step, max_players, bunker_capacity FROM rooms WHERE code = ?")
    .get(code) as RoomRow | undefined;
  if (!room) return null;

  const players = db
    .prepare("SELECT id, name, avatar, color, seat, ready, eliminated FROM room_players WHERE room_code = ? ORDER BY seat")
    .all(code) as PlayerRow[];
  const reveals = db
    .prepare("SELECT rr.player_id, rr.round, rr.card_index, rp.name FROM room_reveals rr JOIN room_players rp ON rp.id = rr.player_id WHERE rr.room_code = ? ORDER BY rr.id")
    .all(code) as Array<{ player_id: string; round: number; card_index: number; name: string }>;
  const ballots = db
    .prepare("SELECT rb.player_id, rb.choice, rp.name FROM room_ballots rb JOIN room_players rp ON rp.id = rb.player_id WHERE rb.room_code = ? AND rb.round = ? ORDER BY rb.id")
    .all(code, room.round);
  const messages = db
    .prepare("SELECT rm.id, rm.player_id, rp.name, rm.text, rm.created_at FROM room_messages rm JOIN room_players rp ON rp.id = rm.player_id WHERE rm.room_code = ? ORDER BY rm.id DESC LIMIT 100")
    .all(code)
    .reverse();
  const events = db
    .prepare("SELECT id, after_round, event_index, created_at FROM room_events WHERE room_code = ? AND event_index >= 0 ORDER BY id")
    .all(code);
  const conditionActions = db
    .prepare(`SELECT rca.id, rca.player_id, actor.name AS player_name, rca.target_player_id, target.name AS target_name,
      rca.condition_id, rca.card_index, rca.created_at
      FROM room_condition_actions rca
      JOIN room_players actor ON actor.id = rca.player_id
      JOIN room_players target ON target.id = rca.target_player_id
      WHERE rca.room_code = ? ORDER BY rca.id`)
    .all(code);
  const activePlayers = players.filter((player) => !player.eliminated);
  const revealedThisRound = new Set(
    reveals.filter((reveal) => reveal.round === room.round).map((reveal) => reveal.player_id),
  );
  const nextTurn = activePlayers.findIndex((player) => !revealedThisRound.has(player.id));

  return {
    room: {
      code: room.code,
      status: room.status,
      seed: room.seed,
      round: room.round,
      currentTurn: nextTurn >= 0 ? nextTurn : 0,
      briefingStep: room.briefing_step,
      maxPlayers: room.max_players,
      bunkerCapacity: room.bunker_capacity,
    },
    players: players.map((player) => ({
      ...player,
      ready: Boolean(player.ready),
      eliminated: Boolean(player.eliminated),
    })),
    reveals,
    ballots,
    messages,
    events,
    conditionActions,
  };
}

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function cleanMessage(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
}

function cleanPlayerLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "8"), 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, parsed));
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}

function authenticatedPlayer(db: DatabaseSync, code: string, token: string) {
  return db
    .prepare("SELECT id, seat, name FROM room_players WHERE room_code = ? AND token = ?")
    .get(code, token) as { id: string; seat: number; name: string } | undefined;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  const payload = roomPayload(code);
  return payload ? json(payload) : json({ error: "Комната не найдена" }, 404);
}

export async function POST(request: Request) {
  const db = getDb();
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const name = cleanName(body.name);

  if (action === "create") {
    if (name.length < 2) return json({ error: "Введите имя от 2 символов" }, 400);
    const maxPlayers = cleanPlayerLimit(body.maxPlayers);
    const bunkerCapacity = Math.max(1, Math.floor(maxPlayers / 2));
    let code = makeCode();
    while (db.prepare("SELECT code FROM rooms WHERE code = ?").get(code)) code = makeCode();

    const token = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const now = Date.now();
    // Each room receives an independent, cryptographically random catastrophe.
    const seed = randomInt(0, CATASTROPHE_COUNT);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO rooms (code, host_token, status, seed, round, current_turn, briefing_step, max_players, bunker_capacity, created_at) VALUES (?, ?, 'lobby', ?, 1, 0, 0, ?, ?, ?)")
        .run(code, token, seed, maxPlayers, bunkerCapacity, now);
      db.prepare("INSERT INTO room_players (id, token, room_code, name, avatar, color, seat, ready, joined_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)")
        .run(playerId, token, code, name, name[0].toUpperCase(), colors[0], now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return json({ ...roomPayload(code), token, playerId, isHost: true }, 201);
  }

  if (action === "join") {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (name.length < 2 || code.length !== 4) return json({ error: "Проверьте имя и код комнаты" }, 400);
    const room = db.prepare("SELECT status, max_players FROM rooms WHERE code = ?").get(code) as { status: string; max_players: number } | undefined;
    if (!room) return json({ error: "Комната с таким кодом не найдена" }, 404);
    if (room.status !== "lobby") return json({ error: "Игра в этой комнате уже началась" }, 409);

    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ?").get(code) as { count: number }).count);
    if (count >= room.max_players) return json({ error: "В комнате нет свободных мест" }, 409);

    const token = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    try {
      db.prepare("INSERT INTO room_players (id, token, room_code, name, avatar, color, seat, ready, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)")
        .run(playerId, token, code, name, name[0].toUpperCase(), colors[count % colors.length], count, Date.now());
    } catch {
      return json({ error: "Игрок с таким именем уже находится в комнате" }, 409);
    }
    return json({ ...roomPayload(code), token, playerId, isHost: false }, 201);
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  const token = String(body.token ?? "");
  const player = authenticatedPlayer(db, code, token);
  const room = db
    .prepare("SELECT code, host_token, status, seed, round, current_turn, briefing_step, max_players, bunker_capacity FROM rooms WHERE code = ?")
    .get(code) as RoomRow | undefined;
  if (!player || !room) return json({ error: "Сессия игрока не найдена" }, 401);

  if (action === "resume") {
    return json({ ...roomPayload(code), token, playerId: player.id, isHost: room.host_token === token });
  }

  if (action === "ready") {
    db.prepare("UPDATE room_players SET ready = ? WHERE id = ?").run(body.ready ? 1 : 0, player.id);
  } else if (action === "start") {
    if (room.host_token !== token) return json({ error: "Запустить игру может только создатель комнаты" }, 403);
    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ?").get(code) as { count: number }).count);
    if (count !== room.max_players) {
      return json({ error: `Для старта должны подключиться все игроки: ${count} из ${room.max_players}` }, 409);
    }
    db.prepare("UPDATE rooms SET status = 'briefing', briefing_step = 0, current_turn = 0 WHERE code = ?").run(code);
  } else if (action === "prologue-step") {
    if (room.host_token !== token) return json({ error: "Хроникой управляет только создатель комнаты" }, 403);
    if (room.status !== "briefing") return json({ error: "Пролог сейчас не открыт" }, 409);
    const step = Math.max(0, Math.min(2, Math.trunc(Number(body.step))));
    db.prepare("UPDATE rooms SET briefing_step = ? WHERE code = ?").run(step, code);
  } else if (action === "enter") {
    if (room.host_token !== token) return json({ error: "Переход подтверждает создатель комнаты" }, 403);
    if (room.status !== "briefing") return json({ error: "Пролог уже завершён или ещё не начат" }, 409);
    db.prepare("UPDATE rooms SET status = 'game', current_turn = 0 WHERE code = ?").run(code);
  } else if (action === "reveal") {
    if (room.status !== "game") return json({ error: "Карты можно раскрывать только во время игры" }, 409);
    const active = db.prepare("SELECT id FROM room_players WHERE room_code = ? AND eliminated = 0 ORDER BY seat").all(code) as Array<{ id: string }>;
    const revealedIds = new Set(
      (db.prepare("SELECT player_id FROM room_reveals WHERE room_code = ? AND round = ?").all(code, room.round) as Array<{ player_id: string }>)
        .map((item) => item.player_id),
    );
    const nextIndex = active.findIndex((item) => !revealedIds.has(item.id));
    if (nextIndex < 0) return json({ error: "Все игроки уже сделали ход в этом раунде" }, 409);
    if (active[nextIndex]?.id !== player.id) return json({ error: "Сейчас ход другого игрока" }, 409);
    const rawCardIndex = Number(body.cardIndex);
    if (!Number.isInteger(rawCardIndex) || rawCardIndex < 0 || rawCardIndex > 5) {
      return json({ error: "Некорректная карта" }, 400);
    }
    const cardIndex = rawCardIndex;
    try {
      db.prepare("INSERT INTO room_reveals (room_code, player_id, round, card_index, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(code, player.id, room.round, cardIndex, Date.now());
    } catch {
      return json({ error: "В этом раунде карта уже раскрыта" }, 409);
    }
    const nextRevealedIds = new Set(revealedIds);
    nextRevealedIds.add(player.id);
    const followingIndex = active.findIndex((item) => !nextRevealedIds.has(item.id));
    if (followingIndex >= 0) {
      db.prepare("UPDATE rooms SET current_turn = ? WHERE code = ?").run(followingIndex, code);
    } else {
      const nextStatus = active.length <= room.bunker_capacity ? "finished" : "voting";
      db.prepare("UPDATE rooms SET status = ?, current_turn = 0 WHERE code = ?").run(nextStatus, code);
    }
  } else if (action === "elimination-vote") {
    if (room.status !== "voting") return json({ error: "Сейчас нет голосования" }, 409);
    const targetPlayerId = String(body.targetPlayerId ?? "");
    const active = db.prepare("SELECT id, name FROM room_players WHERE room_code = ? AND eliminated = 0 ORDER BY seat").all(code) as Array<{ id: string; name: string }>;
    const target = active.find((item) => item.id === targetPlayerId);
    if (!target) return json({ error: "Кандидат уже исключён или не найден" }, 404);
    if (target.id === player.id) return json({ error: "Нельзя голосовать против себя" }, 409);

    db.prepare("INSERT INTO room_ballots (room_code, player_id, round, choice) VALUES (?, ?, ?, ?) ON CONFLICT(room_code, player_id, round) DO UPDATE SET choice = excluded.choice")
      .run(code, player.id, room.round, target.id);

    const ballots = db.prepare("SELECT player_id, choice FROM room_ballots WHERE room_code = ? AND round = ?").all(code, room.round) as Array<{ player_id: string; choice: string }>;
    if (ballots.length >= active.length) {
      const counts = new Map<string, number>();
      for (const ballot of ballots) counts.set(ballot.choice, (counts.get(ballot.choice) ?? 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const top = ranked[0];
      const tied = Boolean(top && ranked.filter((item) => item[1] === top[1]).length > 1);
      if (top && !tied) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE room_players SET eliminated = 1 WHERE id = ?").run(top[0]);
          const eventExists = db.prepare("SELECT id FROM room_events WHERE room_code = ? AND after_round = ?").get(code, room.round);
          if (!eventExists) {
            const scenarioIndex = room.seed % CATASTROPHE_COUNT;
            const eventIndex = scenarioIndex === EVOLVING_VIRUS_INDEX
              ? (room.seed * 7 + room.round * 3) % EVENT_COUNT
              : randomInt(0, 100) < 20 ? randomInt(0, EVENT_COUNT) : -1;
            db.prepare("INSERT INTO room_events (room_code, after_round, event_index, created_at) VALUES (?, ?, ?, ?)")
              .run(code, room.round, eventIndex, Date.now());
          }
          const remaining = active.length - 1;
          if (remaining <= room.bunker_capacity) {
            db.prepare("UPDATE rooms SET status = 'finished', current_turn = 0 WHERE code = ?").run(code);
          } else {
            db.prepare("UPDATE rooms SET status = 'game', round = round + 1, current_turn = 0 WHERE code = ?").run(code);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
    }
  } else if (action === "use-condition") {
    if (room.status !== "game") return json({ error: "Карту условия можно использовать только во время игры" }, 409);
    const targetPlayerId = String(body.targetPlayerId ?? "");
    const cardIndex = Number(body.cardIndex);
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 5) {
      return json({ error: "Выберите корректную характеристику" }, 400);
    }
    const target = db
      .prepare("SELECT id, seat, name, eliminated FROM room_players WHERE room_code = ? AND id = ?")
      .get(code, targetPlayerId) as { id: string; seat: number; name: string; eliminated: number } | undefined;
    if (!target || target.eliminated) return json({ error: "Выбранный игрок недоступен" }, 404);
    if (target.id === player.id) return json({ error: "Нельзя обменяться характеристикой с собой" }, 409);

    const actorState = db.prepare("SELECT eliminated FROM room_players WHERE id = ?").get(player.id) as { eliminated: number } | undefined;
    if (actorState?.eliminated) return json({ error: "Исключённый игрок не может использовать карту условия" }, 409);
    const condition = conditionCardFor(room.seed, player.seat);
    if (!condition.allowedCardIndexes.includes(cardIndex)) {
      return json({ error: "Эта характеристика не разрешена вашей картой условия" }, 409);
    }
    const used = db.prepare("SELECT id FROM room_condition_actions WHERE room_code = ? AND player_id = ?").get(code, player.id);
    if (used) return json({ error: "Карта условия уже использована" }, 409);

    const revealCount = (playerIdToCheck: string) => Number((db
      .prepare("SELECT COUNT(*) AS count FROM room_reveals WHERE room_code = ? AND player_id = ? AND card_index = ?")
      .get(code, playerIdToCheck, cardIndex) as { count: number }).count);
    const actorRevealed = revealCount(player.id) > 0;
    const targetRevealed = revealCount(target.id) > 0;
    if (condition.restriction === "closed" && (actorRevealed || targetRevealed)) {
      return json({ error: "Для этой карты обе характеристики должны оставаться закрытыми" }, 409);
    }
    if (condition.restriction === "revealed" && (!actorRevealed || !targetRevealed)) {
      return json({ error: "Для этой карты обе характеристики должны быть раскрыты" }, 409);
    }

    try {
      db.prepare("INSERT INTO room_condition_actions (room_code, player_id, target_player_id, condition_id, card_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(code, player.id, target.id, condition.id, cardIndex, Date.now());
    } catch {
      return json({ error: "Карта условия уже использована" }, 409);
    }
  } else if (action === "advance-round" || action === "next-round") {
    if (room.host_token !== token) return json({ error: "Новый раунд запускает создатель комнаты" }, 403);
    const activeCount = Number((db.prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ? AND eliminated = 0").get(code) as { count: number }).count);
    const played = Number((db.prepare("SELECT COUNT(*) AS count FROM room_reveals WHERE room_code = ? AND round = ?").get(code, room.round) as { count: number }).count);
    if (activeCount > 0 && played < activeCount) return json({ error: "Раунд ещё не завершён всеми игроками" }, 409);

    db.exec("BEGIN IMMEDIATE");
    try {
      const resolved = db.prepare("SELECT id FROM room_events WHERE room_code = ? AND after_round = ?").get(code, room.round);
      if (!resolved) {
        // The evolving-virus scenario must announce a mutation after every completed round.
        // Other catastrophes keep one independent 20% roll per round.
        const scenarioIndex = room.seed % CATASTROPHE_COUNT;
        const eventIndex = scenarioIndex === EVOLVING_VIRUS_INDEX
          ? (room.seed * 7 + room.round * 3) % EVENT_COUNT
          : randomInt(0, 100) < 20 ? randomInt(0, EVENT_COUNT) : -1;
        db.prepare("INSERT INTO room_events (room_code, after_round, event_index, created_at) VALUES (?, ?, ?, ?)")
          .run(code, room.round, eventIndex, Date.now());
      }
      if (room.round >= 5) {
        db.prepare("UPDATE rooms SET status = 'finished', current_turn = 0 WHERE code = ?").run(code);
      } else {
        db.prepare("UPDATE rooms SET round = round + 1, current_turn = 0 WHERE code = ?").run(code);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else if (action === "round-vote") {
    const choice = body.choice === "yes" ? "yes" : "no";
    db.prepare("INSERT INTO room_ballots (room_code, player_id, round, choice) VALUES (?, ?, ?, ?) ON CONFLICT(room_code, player_id, round) DO UPDATE SET choice = excluded.choice")
      .run(code, player.id, room.round, choice);
  } else if (action === "message") {
    const text = cleanMessage(body.text);
    if (!text) return json({ error: "Введите сообщение" }, 400);
    db.prepare("INSERT INTO room_messages (room_code, player_id, text, created_at) VALUES (?, ?, ?, ?)")
      .run(code, player.id, text, Date.now());
  } else if (action === "eliminate") {
    if (room.host_token !== token) return json({ error: "Исключить игрока может только создатель комнаты" }, 403);
    const playerName = cleanName(body.playerName);
    const target = db.prepare("SELECT id FROM room_players WHERE room_code = ? AND name = ? AND eliminated = 0").get(code, playerName) as { id: string } | undefined;
    if (!target) return json({ error: "Игрок не найден или уже исключён" }, 404);
    if (target.id === player.id) return json({ error: "Создатель не может исключить себя этим действием" }, 409);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE room_players SET eliminated = 1 WHERE id = ?").run(target.id);
      db.prepare("UPDATE rooms SET current_turn = 0 WHERE code = ?").run(code);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else {
    return json({ error: "Неизвестное действие" }, 400);
  }

  return json(roomPayload(code));
}
