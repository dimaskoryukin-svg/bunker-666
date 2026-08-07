"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { catastrophes, getHostEvents, type CapabilityKey, type Catastrophe } from "./game-content";
import { applyConditionActions, conditionCardFor, traitLabels, type ConditionAction } from "./game-rules";

type Screen = "home" | "lobby" | "briefing" | "game";
type Theme = "ember" | "ice" | "signal";
type SideTab = "chat" | "events" | "players";
type Player = { id: string; name: string; role: string; avatar: string; ready: boolean; color: string };
type EventCard = { id: number; title: string; message: string; consequence: string; number: number };
type StoredSession = { code: string; token: string; playerId: string; name: string; isHost: boolean };
type RoomPayload = {
  room: { code: string; status: string; seed: number; round: number; currentTurn: number; briefingStep: number; maxPlayers: number; bunkerCapacity: number };
  players: Array<{ id: string; name: string; avatar: string; color: string; ready: boolean; eliminated: boolean }>;
  reveals: Array<{ player_id: string; round: number; card_index: number; name: string }>;
  ballots: Array<{ player_id: string; choice: string; name: string }>;
  messages: Array<{ id: number; player_id: string; name: string; text: string; created_at: number }>;
  events: Array<{ id: number; after_round: number; event_index: number; created_at: number }>;
  conditionActions: ConditionAction[];
  token?: string;
  playerId?: string;
  isHost?: boolean;
};

const SESSION_KEY = "bunker-room-session-v2";

const traits = [
  { id: "profession", icon: "⚒", suit: "♠", rank: "K", label: "Профессия", hint: "Навык и призвание" },
  { id: "health", icon: "♥", suit: "♥", rank: "Q", label: "Здоровье", hint: "Состояние организма" },
  { id: "biology", icon: "⚥", suit: "♦", rank: "A", label: "Биология", hint: "Пол и возраст" },
  { id: "hobby", icon: "♣", suit: "♣", rank: "J", label: "Хобби", hint: "Полезное увлечение" },
  { id: "baggage", icon: "▣", suit: "♦", rank: "10", label: "Багаж", hint: "Предмет с собой" },
  { id: "special", icon: "✦", suit: "★", rank: "J", label: "Особенность", hint: "Скрытая черта" },
];

const deckPool: string[][] = [
  ["Пилот гражданской авиации", "Старая травма плеча", "Мужчина, 42 года", "Авиамоделизм", "Навигационный планшет", "Не теряется в кризисе"],
  ["Архитектор убежищ", "Полностью здорова", "Женщина, 38 лет", "Керамика", "Чертежи вентиляции", "Не прощает предательства"],
  ["Инструктор по выживанию", "Тиннитус", "Мужчина, 45 лет", "Ориентирование", "Аварийный радиомаяк", "Всегда берёт ответственность"],
  ["Биоинженер", "Непереносимость лактозы", "Женщина, 32 года", "Игра на виолончели", "Криоконтейнер образцов", "Скрывает важное открытие"],
  ["Инженер-энергетик", "Астма", "Женщина, 31 год", "Гидропоника", "Набор семян", "Феноменальная память"],
  ["Спасатель МЧС", "Близорукость", "Мужчина, 36 лет", "Радиолюбитель", "Рация", "Боится замкнутых пространств"],
  ["Вирусолог", "Полностью здорова", "Женщина, 27 лет", "Садоводство", "Фильтр для воды", "Умеет убеждать"],
  ["Повар-технолог", "Диабет I типа", "Мужчина, 44 года", "Столярное дело", "Набор инструментов", "Боится крови"],
  ["Геолог", "Мигрень", "Мужчина, 39 лет", "Спелеология", "Карта подземных вод", "Не умеет лгать"],
  ["Фельдшер", "Аллергия на пыль", "Женщина, 29 лет", "Шитьё", "Полевой хирургический набор", "Спит по четыре часа"],
  ["Агроном", "Глухота на одно ухо", "Мужчина, 52 года", "Пчеловодство", "Контейнер удобрений", "Конфликтный характер"],
  ["Электромеханик", "Абсолютно здоров", "Мужчина, 25 лет", "Дрон-рейсинг", "Солнечная панель", "Боится темноты"],
  ["Психолог", "Бессонница", "Женщина, 34 года", "Первая помощь", "Набор настольных игр", "Читает микромимику"],
  ["Химик", "Гипертония", "Мужчина, 47 лет", "Консервирование", "Респираторы", "Одержим порядком"],
  ["Строитель", "Повреждение колена", "Мужчина, 33 года", "Охота", "Трос и карабины", "Принимает решения мгновенно"],
  ["Метеоролог", "Слабое зрение", "Женщина, 41 год", "Картография", "Барометр", "Никому не доверяет"],
  ["Программист робототехники", "Тремор рук", "Мужчина, 28 лет", "Ремонт часов", "Набор микросхем", "Идеальный слух"],
];
const makeCards = (players: Player[], seed: number) => Object.fromEntries(players.map((player, index) => [player.name, deckPool[(seed + index) % deckPool.length]])) as Record<string, string[]>;
const emptyReveals = (players: Player[]) => Object.fromEntries(players.filter((player) => player.role === "Игрок").map((player) => [player.name, [] as number[]])) as Record<string, number[]>;

const initialEvents = [{ time: "Сейчас", text: "Игра подготовлена", detail: "Сценарий и персонажи распределены случайно" }];

const capabilityPatterns: Record<CapabilityKey, RegExp> = {
  medicine: /врач|фельдшер|вирусолог|биоинженер|медицин|хирург|аптеч|антибиотик|здоров/i,
  engineering: /инженер|электро|строитель|архитектор|механик|программист|пилот|инструмент|микросхем|солнечная панель|чертеж/i,
  defense: /спасатель|инструктор|охот|военн|оруж|трос|карабин|кризис|ответствен/i,
  food: /агроном|повар|семян|гидропоник|удобрени|консерв|садовод|пчеловод/i,
  exploration: /спасатель|геолог|пилот|инструктор|ориентир|картограф|спелеолог|дрон|маяк|карта|метеоролог/i,
  science: /вирусолог|биоинженер|химик|геолог|метеоролог|программист|образц|барометр|лаборатор/i,
  psychology: /психолог|убеждать|микромими|не теряется|настольн|виолончел|слух|память|ответствен/i,
  communication: /радио|рация|маяк|убеждать|переговор|музык|виолончел|слух|пилот/i,
  leadership: /ответствен|решени|убеждать|порядок|не теряется|спасатель|инструктор|архитектор/i,
  memory: /память|картограф|программист|музык|виолончел|чертеж|планшет|карта|дневник|фотограф/i,
};

const capabilityLabels: Record<CapabilityKey, string> = {
  medicine: "медицина", engineering: "инженерия", defense: "защита", food: "пища", exploration: "разведка",
  science: "наука", psychology: "психологическая устойчивость", communication: "связь", leadership: "управление", memory: "сохранение знаний",
};


export default function Home() {
  const latestRoomRef = useRef<RoomPayload | null>(null);
  const promptedRoundKeysRef = useRef<Set<string>>(new Set());
  const previousRoundRef = useRef<number | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [prologueStep, setPrologueStep] = useState(0);
  const [theme, setTheme] = useState<Theme>("ember");
  const [gameSeed, setGameSeed] = useState(0);
  const [scenario, setScenario] = useState<Catastrophe>(catastrophes[0]);
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [characterCards, setCharacterCards] = useState<Record<string, string[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [playerToken, setPlayerToken] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [roomMaxPlayers, setRoomMaxPlayers] = useState(8);
  const [roomBunkerCapacity, setRoomBunkerCapacity] = useState(4);
  const [restoringSession, setRestoringSession] = useState(true);
  const [round, setRound] = useState(1);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(true);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [revealedCards, setRevealedCards] = useState<Record<string, number[]>>({});
  const [roundRevealed, setRoundRevealed] = useState<string[]>([]);
  const [messages, setMessages] = useState<Array<{ id: number; who: string; text: string; mine: boolean }>>([]);
  const [message, setMessage] = useState("");
  const [voteOpen, setVoteOpen] = useState(false);
  const [vote, setVote] = useState<string | null>(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([]);
  const [roundVoteOpen, setRoundVoteOpen] = useState(false);
  const [roundVoteChoice, setRoundVoteChoice] = useState<"yes" | "no" | null>(null);
  const [roundBallots, setRoundBallots] = useState<Record<string, string>>({});
  const [roundVoteResult, setRoundVoteResult] = useState<"yes" | "no" | null>(null);
  const [voteFromRoundEnd, setVoteFromRoundEnd] = useState(false);
  const [endingOpen, setEndingOpen] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [toast, setToast] = useState("");
  const [eventCard, setEventCard] = useState<EventCard | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [liveEvents, setLiveEvents] = useState(initialEvents);
  const [activeTab, setActiveTab] = useState<SideTab>("chat");
  const [roomStatus, setRoomStatus] = useState("lobby");
  const [candidateOpen, setCandidateOpen] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [handOpen, setHandOpen] = useState(true);
  const [conditionActions, setConditionActions] = useState<ConditionAction[]>([]);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [conditionTargetId, setConditionTargetId] = useState("");
  const [conditionCardIndex, setConditionCardIndex] = useState(0);
  const [eventPressures, setEventPressures] = useState<CapabilityKey[]>([]);
  const [canvasScale, setCanvasScale] = useState(1);
  const turnPlayers = gamePlayers.filter((player) => player.role === "Игрок" && !eliminatedPlayers.includes(player.name));
  const currentPlayer = turnPlayers[currentTurn] ?? turnPlayers[0];
  const isMyTurn = Boolean(playerId) && currentPlayer?.id === playerId;
  const roundComplete = turnPlayers.length > 0 && turnPlayers.every((player) => roundRevealed.includes(player.name));
  const bunkerCapacity = roomBunkerCapacity;
  const roomIsFull = gamePlayers.length >= roomMaxPlayers;
  const myCards = characterCards[name] ?? [];
  const myRevealedCards = revealedCards[name] ?? [];
  const mySeat = Math.max(0, gamePlayers.findIndex((player) => player.id === playerId));
  const myCondition = conditionCardFor(gameSeed, mySeat);
  const myConditionUsed = conditionActions.some((action) => action.player_id === playerId);
  const conditionTargets = turnPlayers.filter((player) => player.id !== playerId);
  const selectedConditionTarget = conditionTargets.find((player) => player.id === conditionTargetId);
  const eligibleConditionIndexes = myCondition.allowedCardIndexes.filter((index) => {
    if (!selectedConditionTarget) return true;
    const actorRevealed = myRevealedCards.includes(index);
    const targetRevealed = (revealedCards[selectedConditionTarget.name] ?? []).includes(index);
    if (myCondition.restriction === "closed") return !actorRevealed && !targetRevealed;
    if (myCondition.restriction === "revealed") return actorRevealed && targetRevealed;
    return true;
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem("bunker-theme") as Theme | null;
    if (savedTheme) setTheme(savedTheme);

    const rawSession = localStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      setRestoringSession(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const saved = JSON.parse(rawSession) as StoredSession;
        if (!saved.code || !saved.token || !saved.playerId || !saved.name) throw new Error("Повреждённая сессия");
        setCode(saved.code);
        setPlayerToken(saved.token);
        setPlayerId(saved.playerId);
        setName(saved.name);
        setIsHost(saved.isHost);
        const response = await fetch("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resume", code: saved.code, token: saved.token }),
        });
        if (!response.ok) throw new Error("Сессия комнаты больше не существует");
        const payload = await response.json() as RoomPayload;
        if (!cancelled) hydrateRoom(payload);
      } catch {
        localStorage.removeItem(SESSION_KEY);
        if (!cancelled) {
          setCode("");
          setPlayerToken("");
          setPlayerId("");
          setIsHost(false);
          setScreen("home");
        }
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (restoringSession || !code || !playerToken || !playerId || !name) return;
    const session: StoredSession = { code, token: playerToken, playerId, name, isHost };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [restoringSession, code, playerToken, playerId, name, isHost]);

  useEffect(() => {
    if (!running || screen !== "game" || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, screen, seconds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);



  useEffect(() => {
    if (!code || !playerToken || screen === "home") return;
    const sync = () => void fetch(`/api/rooms?code=${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => {
      if (response.ok) hydrateRoom(await response.json() as RoomPayload);
    }).catch(() => undefined);
    sync();
    const timer = window.setInterval(sync, 1500);
    return () => window.clearInterval(timer);
  }, [code, playerToken, screen, name, playerId]);

  useEffect(() => {
    const updateCanvasScale = () => setCanvasScale(Math.min(1, Math.max(0.42, (window.innerWidth - 8) / 1536)));
    updateCanvasScale();
    window.addEventListener("resize", updateCanvasScale);
    return () => window.removeEventListener("resize", updateCanvasScale);
  }, []);

  const time = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("bunker-theme", next);
  }

  function hydrateRoom(payload: RoomPayload) {
    latestRoomRef.current = payload;
    if (previousRoundRef.current !== null && previousRoundRef.current !== payload.room.round) {
      setRoundVoteOpen(false);
      setRoundVoteChoice(null);
      setRoundVoteResult(null);
      setRoundBallots({});
      setVoteOpen(false);
      setVoteFromRoundEnd(false);
      setVote(null);
    }
    previousRoundRef.current = payload.room.round;
    const selfId = payload.playerId ?? playerId;
    const players = payload.players.map((player) => ({ id: player.id, name: player.name, role: "Игрок", avatar: player.avatar, ready: player.ready, color: player.color }));
    const seed = payload.room.seed % catastrophes.length;
    const selectedScenario = catastrophes[seed];
    const revealMap = emptyReveals(players);
    for (const reveal of payload.reveals) revealMap[reveal.name] = [...(revealMap[reveal.name] ?? []), reveal.card_index];
    const ballots = Object.fromEntries(payload.ballots.map((ballot) => [ballot.name, ballot.choice])) as Record<string, string>;
    const activeCount = payload.players.filter((player) => !player.eliminated).length;

    setCode(payload.room.code);
    setRoomStatus(payload.room.status);
    setGameSeed(seed);
    setScenario(selectedScenario);
    setRoomMaxPlayers(payload.room.maxPlayers);
    setRoomBunkerCapacity(payload.room.bunkerCapacity);
    setGamePlayers(players);
    const nextConditionActions = payload.conditionActions ?? [];
    setConditionActions(nextConditionActions);
    setCharacterCards(applyConditionActions(makeCards(players, seed), nextConditionActions));
    for (const action of nextConditionActions) {
      const detail = `${action.player_name} и ${action.target_name} обменялись характеристикой «${traitLabels[action.card_index]}»`;
      setLiveEvents((items) => items.some((item) => item.text === "Карта условия использована" && item.detail === detail)
        ? items
        : [{ time: new Date(action.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), text: "Карта условия использована", detail }, ...items].slice(0, 30));
    }
    setRevealedCards(revealMap);
    setEliminatedPlayers(payload.players.filter((player) => player.eliminated).map((player) => player.name));
    setRound(payload.room.round);
    setCurrentTurn(payload.room.currentTurn);
    setRoundRevealed(payload.reveals.filter((reveal) => reveal.round === payload.room.round).map((reveal) => reveal.name));
    setRoundBallots(ballots);
    setMessages((payload.messages ?? []).map((item) => ({ id: item.id, who: item.name, text: item.text, mine: item.player_id === selfId })));
    const self = payload.players.find((item) => item.id === selfId);
    if (self) setReady(self.ready);

    if (payload.token) {
      setPlayerToken(payload.token);
      setPlayerId(payload.playerId ?? "");
      setIsHost(Boolean(payload.isHost));
    }

    const eventDeck = getHostEvents(selectedScenario);
    setEventPressures((payload.events ?? []).flatMap((roomEvent) => eventDeck[roomEvent.event_index % eventDeck.length]?.pressure ?? []));
    for (const roomEvent of payload.events ?? []) {
      const event = eventDeck[roomEvent.event_index % eventDeck.length];
      if (!event) continue;
      setLiveEvents((items) => {
        if (items.some((item) => item.text === event.title && item.detail === event.event)) return items;
        const time = new Date(roomEvent.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        return [{ time, text: event.title, detail: event.event }, ...items].slice(0, 30);
      });
    }

    const latestEvent = payload.events?.at(-1);
    let hasUnseenEvent = false;
    if (latestEvent && eventCard?.id !== latestEvent.id) {
      const seenId = Number(localStorage.getItem(`${SESSION_KEY}:seen-event:${payload.room.code}`) ?? "0");
      if (latestEvent.id > seenId) {
        hasUnseenEvent = true;
        const event = eventDeck[latestEvent.event_index % eventDeck.length];
        if (event) {
          setEventCard({ id: latestEvent.id, title: event.title, message: event.message, consequence: event.event, number: latestEvent.after_round });
          setRunning(false);
        }
      }
    }

    if (payload.room.status === "lobby") {
      setGameFinished(false);
      setEndingOpen(false);
      setScreen("lobby");
    } else if (payload.room.status === "briefing") {
      setGameFinished(false);
      setPrologueStep(payload.room.briefingStep ?? 0);
      setRunning(false);
      setScreen("briefing");
    } else if (payload.room.status === "game") {
      setGameFinished(false);
      setVoteOpen(false);
      if (screen !== "game") setSeconds(60);
      if (!hasUnseenEvent && !eventCard) setRunning(true);
      setScreen("game");
    } else if (payload.room.status === "voting") {
      setGameFinished(false);
      setRunning(false);
      setVoteOpen(true);
      setScreen("game");
    } else if (payload.room.status === "finished") {
      setGameFinished(true);
      setRunning(false);
      setScreen("game");
      setEndingOpen(true);
    }
  }

  async function submitRoom(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, code, token: playerToken, ...extra }) });
    const payload = await response.json() as RoomPayload & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Не удалось обновить комнату");
    hydrateRoom(payload);
    return payload;
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault(); setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name, maxPlayers }) });
      const payload = await response.json() as RoomPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать комнату");
      hydrateRoom(payload); setReady(true); setShowCreate(false); setToast(`Комната ${payload.room.code} создана`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Ошибка создания комнаты"); } finally { setRoomLoading(false); }
  }

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault(); setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", code, name }) });
      const payload = await response.json() as RoomPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось войти в комнату");
      hydrateRoom(payload); setReady(false); setShowJoin(false); setToast(`Вы вошли в комнату ${payload.room.code}`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Ошибка подключения"); } finally { setRoomLoading(false); }
  }

  async function beginBriefing() {
    try { await submitRoom("start"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось начать игру"); }
  }

  async function changePrologueStep(step: number) {
    if (!isHost) return;
    try {
      await submitRoom("prologue-step", { step });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось продолжить хронику");
    }
  }

  async function enterGame() {
    try { await submitRoom("enter"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось войти в бункер"); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    try { await submitRoom("message", { text }); } catch (error) { setMessage(text); setToast(error instanceof Error ? error.message : "Сообщение не отправлено"); }
  }

  async function advanceRound() {
    if (!roundComplete) return;
    const completedRound = round;
    try { await submitRoom("advance-round"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось завершить раунд"); return; }
    setSeconds(60);
    setRoundVoteOpen(false);
    if (completedRound < 5) {
      const next = completedRound + 1;
      setToast(`Раунд ${next}: первым ходит ${turnPlayers[0]?.name ?? "игрок"}`);
      setLiveEvents((items) => [{ time: "Сейчас", text: `Начался раунд ${next}`, detail: "После прошлого раунда сервер проверил 20% шанс события" }, ...items].slice(0, 30));
    } else {
      setToast("Последний раунд завершён");
    }
  }

  async function castRoundVote(choice: "yes" | "no") {
    try { await submitRoom("round-vote", { choice }); } catch (error) { setToast(error instanceof Error ? error.message : "Голос не принят"); }
  }

  function continueAfterRoundVote() {
    if (roundVoteResult === "yes") {
      setRoundVoteOpen(false);
      setVoteFromRoundEnd(true);
      setVote(null);
      setVoteOpen(true);
      return;
    }
    setRoundVoteOpen(false);
    void advanceRound();
  }

  async function confirmElimination() {
    if (!vote || !isHost) return;
    const eliminated = vote;
    try {
      await submitRoom("eliminate", { playerName: eliminated });
      setVoteOpen(false);
      setToast(`${eliminated} исключён из бункера решением группы`);
      if (voteFromRoundEnd) {
        setVoteFromRoundEnd(false);
        window.setTimeout(() => void advanceRound(), 0);
      }
      setVote(null);
    } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось исключить игрока"); }
  }

  async function castEliminationVote(targetPlayerId: string) {
    try {
      await submitRoom("elimination-vote", { targetPlayerId });
      setToast("Голос принят");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Голос не принят");
    }
  }

  async function revealCard(playerName: string, cardIndex: number) {
    if (playerName !== name || currentPlayer?.id !== playerId || roundRevealed.includes(playerName) || revealedCards[playerName]?.includes(cardIndex)) return;
    try {
      await submitRoom("reveal", { cardIndex });
      const label = traits[cardIndex].label;
      const value = characterCards[playerName][cardIndex];
      setSeconds(60);
      setLiveEvents((items) => [{ time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), text: `${playerName} раскрыл карту`, detail: `${label}: ${value}` }, ...items].slice(0, 30));
      setToast(`${playerName}: раскрыто «${label}»`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Карта не раскрыта"); }
  }


  function openConditionCard() {
    const firstTarget = conditionTargets[0];
    setConditionTargetId(firstTarget?.id ?? "");
    setConditionCardIndex(myCondition.allowedCardIndexes[0] ?? 0);
    setConditionOpen(true);
  }

  async function useConditionCard() {
    if (!conditionTargetId || myConditionUsed) return;
    try {
      const target = conditionTargets.find((player) => player.id === conditionTargetId);
      await submitRoom("use-condition", { targetPlayerId: conditionTargetId, cardIndex: conditionCardIndex });
      setConditionOpen(false);
      setToast(`Карта условия использована: ${traitLabels[conditionCardIndex]} обменена с ${target?.name ?? "игроком"}`);
      setLiveEvents((items) => [{
        time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        text: `${name} использовал карту условия`,
        detail: `Произошёл обмен характеристикой «${traitLabels[conditionCardIndex]}»`,
      }, ...items].slice(0, 30));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось использовать карту условия");
    }
  }

  function prepareNewGame() {
    localStorage.removeItem(SESSION_KEY);
    window.location.assign("/");
  }

  const gameEnding = useMemo(() => {
    const survivors = gamePlayers.filter((player) => !eliminatedPlayers.includes(player.name));
    const profile = survivors.flatMap((player) => characterCards[player.name] ?? []).join(" ").toLowerCase();
    const scores = Object.fromEntries(
      (Object.keys(capabilityPatterns) as CapabilityKey[]).map((key) => [key, capabilityPatterns[key].test(profile) ? 1 : 0]),
    ) as Record<CapabilityKey, number>;
    const required = scenario.ending.requirements;
    const weightedRequirements = [...required, ...eventPressures];
    const uniqueRequirements = [...new Set(weightedRequirements)];
    const present = uniqueRequirements.filter((key) => scores[key] > 0);
    const missing = uniqueRequirements.filter((key) => scores[key] === 0);
    const medicalRisks = (profile.match(/астма|диабет|гипертония|мигрень|бессонница|тремор|аллергия|повреждение|травма|глухота|слабое зрение|близорукость/g) ?? []).length;
    const coverage = weightedRequirements.length ? weightedRequirements.filter((key) => scores[key] > 0).length / weightedRequirements.length : 0;
    const populationStable = survivors.length >= Math.max(2, bunkerCapacity - 1);

    let tier: "success" | "partial" | "failure" = "failure";
    if (coverage >= 0.8 && populationStable && medicalRisks <= Math.max(2, survivors.length)) tier = "success";
    else if (coverage >= 0.5 && survivors.length >= 2) tier = "partial";

    const title = "ОТБОР ЗАВЕРШЁН";
    const verdict = tier === "success"
      ? `Выбранный состав хорошо соответствует катастрофе «${scenario.title}». ${scenario.ending.success}`
      : tier === "partial"
        ? `Состав получил места в бункере, но у него есть опасные пробелы. ${scenario.ending.partial}`
        : `Голосование сформировало уязвимый состав. ${scenario.ending.failure}`;
    const reasons = present.map((key) => `Есть: ${capabilityLabels[key]}`);
    const weaknesses = missing.map((key) => `Не хватает: ${capabilityLabels[key]}`);
    if (!populationStable) weaknesses.push("Слишком мало людей для устойчивой группы");
    if (medicalRisks > Math.max(2, survivors.length)) weaknesses.push("Высокая медицинская нагрузка на ограниченные ресурсы");

    return {
      survivors, title, verdict, reasons, weaknesses,
      hasMedicine: scores.medicine > 0, hasEngineering: scores.engineering > 0, hasFood: scores.food > 0,
    };
  }, [gamePlayers, eliminatedPlayers, characterCards, scenario, bunkerCapacity, eventPressures]);

  if (restoringSession) {
    return <main className={`app theme-${theme}`}><div className="session-restoring"><span className="brand-mark"><i /><i /><i /></span><b>Восстанавливаем комнату…</b><small>Проверяем код и вашу игровую сессию</small></div></main>;
  }

  return (
    <main className={`app theme-${theme}`} style={{ "--scenario-accent": scenario.visual.accent } as CSSProperties}>
      {screen !== "game" && <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="На главную">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>БУНКЕР<small>остаться человеком</small></span>
        </button>
        <div className="top-actions">
          {screen !== "home" && <span className="room-chip"><span className="live-dot" /> Комната <b>{code}</b></span>}
          <div className="themes" aria-label="Выбор темы">
            <button className={theme === "ember" ? "active ember" : "ember"} onClick={() => chooseTheme("ember")} aria-label="Тема Уголь" />
            <button className={theme === "ice" ? "active ice" : "ice"} onClick={() => chooseTheme("ice")} aria-label="Тема Лёд" />
            <button className={theme === "signal" ? "active signal" : "signal"} onClick={() => chooseTheme("signal")} aria-label="Тема Сигнал" />
          </div>
          <button className="sound" aria-label="Звук">◖))</button>
          <div className="mini-avatar">{name.trim().charAt(0).toUpperCase() || "?"}</div>
        </div>
      </header>}

      {screen === "home" && (
        <section className="home-screen">
          <div className="hero-copy">
            <span className="eyebrow"><span className="live-dot" /> Онлайн-игра для 3–12 человек</span>
            <h1>Кому достанется<br /><em>место в бункере?</em></h1>
            <p>Катастрофа уже случилась. Убеди остальных, что именно ты нужен новому миру — пока дверь не закрылась.</p>
            <div className="hero-actions">
              <button className="primary big" onClick={() => { setRoomError(""); setShowCreate(true); }}>Создать комнату <span>→</span></button>
              <button className="secondary big" onClick={() => { setRoomError(""); setShowJoin(true); }}>Войти по коду</button>
            </div>
            <div className="trust-row"><span><b>10 000+</b> игр сыграно</span><i /><span><b>4,9</b> рейтинг игроков</span><i /><span>Без установки</span></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="radar"><span /><span /><span /><b>5</b></div>
            <div className="hazard-card">
              <div className="hazard-top"><span>СЦЕНАРИЙ #001</span><b>УРОВЕНЬ: КРИТИЧЕСКИЙ</b></div>
              <div className="hazard-icon">☣</div>
              <h3>ЗОМБИ-АПОКАЛИПСИС</h3>
              <p>Погибшие возвращаются, а любой громкий звук приводит орду к убежищу.</p>
              <div className="hazard-stats"><span><small>В БУНКЕРЕ</small><b>5 мест</b></span><span><small>ПРЕТЕНДЕНТОВ</small><b>8 человек</b></span><span><small>ЗАПАСЫ</small><b>14 месяцев</b></span></div>
            </div>
            <div className="float-card fc-one"><span>◉</span><small>ПРОФЕССИЯ</small><b>Хирург</b></div>
            <div className="float-card fc-two"><span>◈</span><small>БАГАЖ</small><b>Аптечка</b></div>
            <div className="scan-line" />
          </div>
          <div className="how-strip">
            <b>Как это работает</b>
            <span><i>01</i> Соберите команду</span>
            <span><i>02</i> Получите персонажа</span>
            <span><i>03</i> Докажите свою ценность</span>
            <span><i>04</i> Проголосуйте</span>
          </div>
        </section>
      )}

      {screen === "lobby" && (
        <section className="lobby-screen page-shell">
          <div className="section-head">
            <div><span className="eyebrow">Комната готова</span><h1>Собираем выживших</h1><p>В комнате отображаются только люди, которые сами вошли по коду. Боты отключены.</p></div>
            <div className="code-card"><small>КОД КОМНАТЫ</small><b>{code}</b><button onClick={() => { navigator.clipboard?.writeText(code); setToast("Код скопирован"); }}>Копировать</button></div>
          </div>
          <div className="lobby-grid">
            <div className="panel player-panel">
              <div className="panel-title"><h2>Игроки <span>{gamePlayers.length} / {roomMaxPlayers}</span></h2><span className="status-good">{gamePlayers.filter((player) => player.ready).length} готовы</span></div>
              <div className="player-list">
                {gamePlayers.map((player, index) => (
                  <div className="player-row" key={player.name}>
                    <div className={`avatar ${player.color}`}>{player.avatar}</div>
                    <div><b>{player.name}</b><small>Реальный игрок{player.name === name ? " · это вы" : ""}</small></div>
                    {index === 0 && <span className="host-badge">◆ Создатель</span>}
                    <span className={player.ready ? "ready" : "waiting"}>{player.ready ? "✓ Готов" : "Ожидает"}</span>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, roomMaxPlayers - gamePlayers.length) }, (_, slot) => <div className="player-row empty" key={slot}><div className="avatar">+</div><span>Свободное место · подключение по коду</span></div>)}
              </div>
            </div>
            <aside className="lobby-side">
              <div className="panel settings-card">
                <div className="panel-title"><h2>Параметры игры</h2><span>⚙</span></div>
                <dl><div><dt>Сценарий</dt><dd>{scenario.title}</dd></div><div><dt>Игроков в партии</dt><dd>{roomMaxPlayers}</dd></div><div><dt>Мест в бункере</dt><dd>{bunkerCapacity}</dd></div><div><dt>События катастрофы</dt><dd>{scenario.id === "virus" ? "Мутация после каждого раунда" : "20% после раунда"}</dd></div><div><dt>Катастроф в каталоге</dt><dd>100</dd></div><div><dt>Время на ход</dt><dd>1 минута</dd></div></dl>
              </div>
              <button className={ready ? "ready-toggle active" : "ready-toggle"} onClick={async () => { const next = !ready; try { await submitRoom("ready", { ready: next }); setReady(next); } catch (error) { setToast(error instanceof Error ? error.message : "Статус не обновлён"); } }}><span>{ready ? "✓" : "○"}</span><b>{ready ? "Вы готовы" : "Нажмите, когда готовы"}</b><small>{ready ? "Ждём остальных игроков" : "Ваш статус увидят все в комнате"}</small></button>
              {isHost ? <button className="primary start" disabled={!roomIsFull} onClick={() => void beginBriefing()}>{!roomIsFull ? `Ждём игроков: ${gamePlayers.length} из ${roomMaxPlayers}` : "Открыть пролог"} <span>→</span></button> : <div className="multiplayer-wait"><span className="live-dot" /> Создатель комнаты запустит игру</div>}
              <p className="demo-note">0 ботов · только реальные подключения по коду</p>
            </aside>
          </div>
        </section>
      )}

      {screen === "briefing" && (
        <section className="story-screen" aria-label="Предыстория катастрофы">
          <div className="story-atmosphere" aria-hidden="true"><span>{scenario.icon}</span><i /><i /><i /></div>
          <div className="story-frame">
            <div className="story-topline">
              <span>АРХИВ «КОВЧЕГ»</span>
              <span>ДЕЛО {String(gameSeed + 1).padStart(3, "0")} / 100</span>
              <span className="story-classified">РАССЕКРЕЧЕНО</span>
            </div>
            <div className="story-layout">
              <aside className="story-index">
                <div className="story-glyph">{scenario.icon}</div>
                <small>КАТАСТРОФА</small>
                <b>{scenario.title}</b>
                <div className="story-meta"><span><small>ДАТА НУЛЕВОГО ДНЯ</small>{scenario.backstory.date}</span><span><small>АВТОНОМНОСТЬ</small>{scenario.detail.split(";")[0].replace("Автономность ", "")}</span><span><small>ГЛАВНЫЙ ДЕФИЦИТ</small>{scenario.resource}</span></div>
              </aside>
              <article className="story-copy" key={`${scenario.id}-${prologueStep}`}>
                <span className="story-chapter">{scenario.backstory.format.toUpperCase()} · {scenario.backstory.chapterTitles[prologueStep]}</span>
                <h1>{scenario.backstory.headlines[prologueStep]}</h1>
                <p>{scenario.backstory.chapters[prologueStep]}</p>
                <blockquote><span>ПОСЛЕДНИЙ ПРИНЯТЫЙ СИГНАЛ</span>{scenario.backstory.finalWords}</blockquote>
              </article>
            </div>
            <div className="story-controls">
              <div className="story-progress" aria-label={`Сцена ${prologueStep + 1} из 3`}>
                {[0, 1, 2].map((step) => isHost
                  ? <button key={step} className={step === prologueStep ? "active" : step < prologueStep ? "done" : ""} onClick={() => void changePrologueStep(step)} aria-label={`Открыть сцену ${step + 1}`}><i />0{step + 1}</button>
                  : <span key={step} className={step === prologueStep ? "active" : step < prologueStep ? "done" : ""}><i />0{step + 1}</span>)}
              </div>
              <div className="story-actions">
                {isHost ? <>
                  {prologueStep > 0 && <button className="story-back" onClick={() => void changePrologueStep(prologueStep - 1)}>← Назад</button>}
                  {prologueStep < 2
                    ? <button className="primary story-next" onClick={() => void changePrologueStep(prologueStep + 1)}>Продолжить хронику <span>→</span></button>
                    : <button className="primary story-next" onClick={() => void enterGame()}>Войти в бункер <span>→</span></button>}
                </> : <span className="story-wait"><i className="live-dot" /> Прологом управляет создатель комнаты</span>}
              </div>
            </div>
          </div>
          {isHost && <button className="story-skip" onClick={() => void enterGame()}>Пропустить пролог</button>}
        </section>
      )}

      {screen === "game" && (
        <section className="v113-viewport">
          <div className="v113-scale-wrap" style={{ width: 1536 * canvasScale, height: 1024 * canvasScale }}>
            <div className="v113-refcanvas" style={{ transform: `scale(${canvasScale})` }}>
              <img className="v113-reference-image" src="/reference-v113.png" alt="Игровой интерфейс Бункера" />

              {activeTab === "events" ? (
                <section className="v113-ref-journal">
                  <div className="v113-ref-journal-head"><b>ЖУРНАЛ СОБЫТИЙ</b><button onClick={() => setActiveTab("chat")}>×</button></div>
                  <aside><button className="active">ВСЕ</button><button>РАСКРЫТИЯ</button><button>ГОЛОСОВАНИЯ</button><button>КАРТЫ</button><button>МУТАЦИИ</button></aside>
                  <main>{liveEvents.slice(0,30).map((item,index)=><article key={`${item.time}-${item.text}-${index}`}><time>{item.time}</time><span><b>{item.text}</b><small>{item.detail}</small></span></article>)}</main>
                </section>
              ) : <>
                <section className="v113-live-lobby" aria-label="Кандидаты">
                  {gamePlayers.slice(0,6).map((player) => {
                    const current=currentPlayer?.id===player.id && roomStatus === "game";
                    const eliminated=eliminatedPlayers.includes(player.name);
                    const self=player.id===playerId;
                    return <button key={player.id} className={`${current?"turn":""} ${eliminated?"eliminated":""}`} onClick={()=>setCandidateOpen(player.name)}>
                      <span className="v113-live-avatar">{eliminated?"×":player.avatar}</span>
                      <span>{self&&<em>ХОСТ</em>}<b>{player.name}</b></span>
                      <strong className={eliminated||!player.ready?"bad":"good"}>{eliminated?"ИСКЛЮЧЁН":current?"ХОДИТ":player.ready?"ГОТОВ":"НЕ ГОТОВ"}</strong>
                    </button>;
                  })}
                </section>
                <div className="v113-live-round"><span>Раунд {round} из {Math.max(round,roomMaxPlayers-bunkerCapacity+1)}</span><span>Фаза: <b>{roomStatus === "voting" ? "Голосование" : "Обсуждение"}</b></span><span>{time} ◷</span></div>

                <section className="v113-live-dossier">
                  <h2>{name || "Игрок"}</h2><small>{myCards[2] ?? "Ваш персонаж"}</small>
                  <div>{traits.map((trait,index)=>{const opened=myRevealedCards.includes(index);const canReveal=roomStatus==="game"&&isMyTurn&&!roundRevealed.includes(name)&&!opened&&!eliminatedPlayers.includes(name);return <button key={trait.id} className={opened?"opened":"private"} onClick={()=>{if(canReveal) void revealCard(name,index)}}><i>{trait.icon}</i><span>{trait.label}</span><b>{myCards[index]??"—"}</b><em>{opened?"ОТКРЫТО":"ЛИЧНО"}</em></button>})}</div>
                </section>
                <button className="v113-hotspot v113-condition-hotspot" onClick={openConditionCard} aria-label="Показать карту условия" />

                <section className="v113-live-catcopy">
                  <h2>{scenario.title}</h2><p>{scenario.opening}</p>
                </section>
                <section className="v113-live-catgoal"><b>Цель отбора</b><p>Выбрать {bunkerCapacity} кандидатов, наиболее полезных при этой катастрофе.</p></section>
                <button className="v113-hotspot v113-cat-hotspot" onClick={()=>setDossierOpen(true)} aria-label="Подробнее о катастрофе" />

                <section className="v113-live-prologue"><h3>{scenario.backstory.headlines[prologueStep]}</h3><p>{scenario.backstory.chapters[prologueStep]}</p></section>
                <button className="v113-hotspot v113-prologue-prev" disabled={!isHost||prologueStep===0} onClick={()=>void changePrologueStep(Math.max(0,prologueStep-1))} aria-label="Назад" />
                <button className="v113-hotspot v113-prologue-next" disabled={!isHost||prologueStep===2} onClick={()=>void changePrologueStep(Math.min(2,prologueStep+1))} aria-label="Далее" />

                <section className="v113-live-event"><h3>{roomStatus==="voting"?"ГОЛОСОВАНИЕ":(liveEvents[0]?.text??scenario.threat)}</h3><p>{roomStatus==="voting"?"Кандидаты выбирают, кого исключить из отбора.":(liveEvents[0]?.detail??scenario.threat)}</p><small>ЭФФЕКТ</small><b>{roomStatus==="voting"?`Получено голосов: ${Object.keys(roundBallots).length} / ${turnPlayers.length}`:"Событие влияет на ценность характеристик кандидатов."}</b></section>
                <button className="v113-hotspot v113-event-action" onClick={()=>roomStatus==="voting"?setVoteOpen(true):setActionOpen(true)} aria-label="Принять решение" />

                <section className="v113-live-card">
                  <h2>{myCondition.title}</h2><div>⇄</div><b>ТИП: УСЛОВИЕ</b><hr/><p>{myCondition.description}</p><small>{myConditionUsed?"Карта использована":"Можно использовать 1 раз"}</small>
                </section>
                <button className="v113-hotspot v113-card-action" disabled={myConditionUsed||conditionTargets.length===0} onClick={openConditionCard} aria-label="Применить карту" />

                <section className="v113-live-report">
                  <h2>{gameFinished?"ОТБОР ЗАВЕРШЁН":"ОТБОР ИДЁТ"}</h2>
                  {gameFinished ? <><p>{gameEnding.verdict}</p><h3>В БУНКЕР ВОШЛИ</h3>{gameEnding.survivors.slice(0,3).map(player=><span key={player.name}>• {player.name} — {characterCards[player.name]?.[0]}</span>)}</> : <><p>Каждый кандидат раскрывает характеристики и доказывает свою ценность.</p><h3>КАНДИДАТОВ / МЕСТ</h3><strong>{turnPlayers.length} / {bunkerCapacity}</strong><h3>СЛЕДУЮЩИЙ ЭТАП</h3><span>{roomStatus==="voting"?"Голосование на исключение":"Раскрытие характеристик"}</span></>}
                </section>
                <button className="v113-hotspot v113-report-action-hotspot" onClick={()=>gameFinished?setScreen("home"):setActiveTab("events")} aria-label="Открыть итог или журнал" />

                <button className="v113-hotspot v113-top-dossier" onClick={()=>setCandidateOpen(name)} aria-label="Досье" />
                <button className="v113-hotspot v113-top-cards" onClick={()=>setActionOpen(true)} aria-label="Карты" />
                <button className="v113-hotspot v113-top-journal" onClick={()=>setActiveTab("events")} aria-label="Журнал" />
                <button className="v113-hotspot v113-top-settings" onClick={()=>setToast("Настройки подключим после утверждения основного экрана")} aria-label="Настройки" />

                <button className="v113-hotspot v113-bottom-lobby" onClick={()=>setActiveTab("chat")} aria-label="Лобби" />
                <button className="v113-hotspot v113-bottom-dossier" onClick={()=>setCandidateOpen(name)} aria-label="Досье" />
                <button className="v113-hotspot v113-bottom-cards" onClick={()=>setActionOpen(true)} aria-label="Карты" />
                <button className="v113-hotspot v113-bottom-journal" onClick={()=>setActiveTab("events")} aria-label="Журнал" />
                <button className="v113-hotspot v113-bottom-settings" onClick={()=>setToast("Настройки подключим после утверждения основного экрана")} aria-label="Настройки" />
              </>}
            </div>
          </div>
        </section>
      )}

      {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="modal" onSubmit={createRoom} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" onClick={() => setShowCreate(false)}>×</button>
        <span className="eyebrow">Новая комната</span><h2>Создать комнату</h2>
        <p>Выберите размер партии. Войти смогут только реальные игроки с кодом комнаты.</p>
        <label>Ваше имя<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={20} autoFocus /></label>
        <label>Количество игроков<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 3).map((count) => <option value={count} key={count}>{count} игроков</option>)}</select></label>
        <div className="lobby-capacity-preview"><span>В комнате: <b>{maxPlayers}</b></span><span>Мест в бункере: <b>{Math.max(1, Math.floor(maxPlayers / 2))}</b></span></div>
        {roomError && <p className="room-error">{roomError}</p>}
        <button className="primary big" type="submit" disabled={roomLoading}>{roomLoading ? "Создаём…" : "Создать комнату"} <span>→</span></button>
      </form></div>}

      {showJoin && <div className="modal-backdrop" onMouseDown={() => setShowJoin(false)}><form className="modal" onSubmit={joinRoom} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" onClick={() => setShowJoin(false)}>×</button><span className="eyebrow">Подключение</span><h2>Войти в комнату</h2><p>Введите имя и четырёхсимвольный код от создателя. Без кода подключиться невозможно.</p><label>Ваше имя<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={20} /></label><label>Код комнаты<input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} required minLength={4} maxLength={4} /></label>{roomError && <p className="room-error">{roomError}</p>}<button className="primary big" type="submit" disabled={roomLoading}>{roomLoading ? "Подключаем…" : "Присоединиться"} <span>→</span></button></form></div>}

      {dossierOpen && <div className="modal-backdrop dossier-backdrop" onMouseDown={() => setDossierOpen(false)}><article className="catastrophe-dossier" role="dialog" aria-modal="true" aria-label={`Досье катастрофы: ${scenario.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <span className="paper-fold dossier-fold-one" /><span className="paper-fold dossier-fold-two" /><span className="paper-stain dossier-stain-one" /><span className="paper-stain dossier-stain-two" />
        <button className="dossier-close" onClick={() => setDossierOpen(false)} aria-label="Закрыть досье">×</button>
        <header><span>{scenario.icon}</span><div><small>АРХИВ «КОВЧЕГ» · ДЕЛО {String(gameSeed + 1).padStart(3, "0")}</small><h2>{scenario.title}</h2><p>ПРОТОКОЛ КАТАСТРОФЫ · ДОПУСК КРАСНЫЙ</p></div></header>
        <div className="dossier-stamp">РАССЕКРЕЧЕНО</div>
        <section className="dossier-lead"><span>СВОДКА</span><p>{scenario.opening}</p></section>
        <div className="dossier-grid"><section><small>ЧТО ПРОИЗОШЛО</small><p>{scenario.summary}. {scenario.detail}.</p></section><section><small>ОБСТАНОВКА СНАРУЖИ</small><p>{scenario.outside}. Главная угроза — {scenario.threat}.</p></section><section><small>МЕХАНИКА УГРОЗЫ</small><p>{scenario.mechanic}</p></section><section><small>СВЯЗЬ С ХАРАКТЕРИСТИКАМИ</small><p>{scenario.compatibility}</p></section><section><small>ГЛАВНЫЙ ДЕФИЦИТ</small><b>{scenario.resource}</b></section><section><small>ВМЕСТИМОСТЬ</small><b>{bunkerCapacity} места на {gamePlayers.length} человек</b></section></div>
        <blockquote>{scenario.backstory.finalWords}</blockquote>
        <footer><span>ДАТА НУЛЕВОГО ДНЯ · {scenario.backstory.date}</span><button onClick={() => setDossierOpen(false)}>Закрыть документ</button></footer>
      </article></div>}

      {voteOpen && roomStatus === "voting" && <div className="modal-backdrop v18-vote-backdrop"><div className="modal v18-vote-modal" onMouseDown={(e) => e.stopPropagation()}>
        <span className="eyebrow">ГОЛОСОВАНИЕ · РАУНД {round}</span><h2>Кого НЕ стоит брать в бункер?</h2><p>Каждый кандидат голосует самостоятельно. Когда все голоса будут получены, игрок с большинством голосов будет исключён. При ничьей можно изменить голос.</p>
        <div className="v18-vote-progress">Получено голосов: <b>{Object.keys(roundBallots).length} / {turnPlayers.length}</b></div>
        <div className="vote-list">{turnPlayers.filter((player) => player.id !== playerId).map((player) => {
          const count=Object.values(roundBallots).filter((choice)=>choice===player.id).length;
          const mine=roundBallots[name]===player.id;
          return <button className={mine ? "selected" : ""} key={player.id} onClick={() => void castEliminationVote(player.id)}><div className={`avatar ${player.color}`}>{player.avatar}</div><span><b>{player.name}</b><small>{(revealedCards[player.name] ?? []).includes(0) ? characterCards[player.name]?.[0] : "Профессия скрыта"}</small></span><em>{count} голос.</em></button>;
        })}</div>
        {roundBallots[name] ? <div className="v18-voted">✓ Ваш голос принят. До завершения голосования его можно изменить.</div> : <div className="v18-voted waiting">Выберите одного кандидата.</div>}
        <div className="multiplayer-wait"><span className="live-dot" /> Решение применяется сервером автоматически после голосов всех игроков</div>
      </div></div>}

      {actionOpen && <div className="modal-backdrop" onMouseDown={()=>setActionOpen(false)}><div className="modal v18-action-modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setActionOpen(false)}>×</button><span className="eyebrow">ВАШИ ДЕЙСТВИЯ</span><h2>Выберите действие</h2><div className="v18-action-grid">
        <button disabled={!isMyTurn || roundRevealed.includes(name)} onClick={()=>{setActionOpen(false); document.querySelector('.v19-my-zone')?.scrollIntoView({behavior:'smooth'})}}>◉<b>Вскрыть характеристику</b><small>Откройте одну свою закрытую характеристику</small></button>
        <button disabled={myConditionUsed} onClick={()=>{setActionOpen(false);openConditionCard()}}>▣<b>Использовать карту условия</b><small>{myCondition.title}</small></button>
        <button onClick={()=>{setActionOpen(false);setToast('Выберите особую карту на игровом столе')}}>★<b>Использовать особую карту</b><small>Все особые эффекты работают только с существующими механиками</small></button>
        <button disabled={myConditionUsed} onClick={()=>{setActionOpen(false);openConditionCard()}}>⇄<b>Обменяться характеристикой</b><small>Обмен доступен через вашу карту условия</small></button>
        <button disabled>▣<b>Пропустить ход</b><small>Недоступно: в свой ход необходимо выполнить действие</small></button>
      </div></div></div>}

      {candidateOpen && (() => { const player=gamePlayers.find(p=>p.name===candidateOpen); if(!player)return null; const self=player.id===playerId; return <div className="modal-backdrop" onMouseDown={()=>setCandidateOpen(null)}><article className="modal v18-player-dossier" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setCandidateOpen(null)}>×</button><span className="eyebrow">ДОСЬЕ КАНДИДАТА</span><div className="v18-dossier-head"><div className={`avatar ${player.color}`}>{player.avatar}</div><div><h2>{player.name}{self ? " (вы)" : ""}</h2><p>{eliminatedPlayers.includes(player.name) ? "ИСКЛЮЧЁН ИЗ ОТБОРА" : `${(revealedCards[player.name] ?? []).length} из 6 характеристик раскрыто`}</p></div></div><div className="v18-dossier-traits">{traits.map((trait,index)=>{const opened=(revealedCards[player.name]??[]).includes(index);const visible=self||opened;return <div key={trait.id} className={opened?'open':visible?'private':'closed'}><span>{trait.icon}</span><small>{trait.label}</small><b>{visible?characterCards[player.name]?.[index]:'СКРЫТО'}</b></div>})}</div><button className="secondary big" onClick={()=>setCandidateOpen(null)}>Закрыть</button></article></div>; })()}

      {conditionOpen && <div className="modal-backdrop condition-backdrop" onMouseDown={() => setConditionOpen(false)}><div className="modal condition-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={() => setConditionOpen(false)}>×</button>
        <span className="eyebrow">КАРТА УСЛОВИЯ · ОДИН РАЗ ЗА ИГРУ</span><h2>{myCondition.title}</h2><p>{myCondition.description}</p>
        <label>С кем обменяться<select value={conditionTargetId} onChange={(event) => { setConditionTargetId(event.target.value); const nextTarget = conditionTargets.find((player) => player.id === event.target.value); const nextIndex = myCondition.allowedCardIndexes.find((index) => { const ownOpen = myRevealedCards.includes(index); const targetOpen = (revealedCards[nextTarget?.name ?? ""] ?? []).includes(index); return myCondition.restriction === "closed" ? !ownOpen && !targetOpen : myCondition.restriction === "revealed" ? ownOpen && targetOpen : true; }); setConditionCardIndex(nextIndex ?? myCondition.allowedCardIndexes[0] ?? 0); }}>{conditionTargets.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
        <label>Какой характеристикой<select value={conditionCardIndex} onChange={(event) => setConditionCardIndex(Number(event.target.value))}>{eligibleConditionIndexes.map((index) => <option value={index} key={index}>{traitLabels[index]} — ваша: {myCards[index] ?? "не назначена"}</option>)}</select></label>
        {eligibleConditionIndexes.length === 0 && <p className="room-error">Сейчас нет характеристик, подходящих под условие карты. Дождитесь нужного этапа раскрытия.</p>}
        <div className="condition-preview"><small>РЕЗУЛЬТАТ</small><b>Вы и {selectedConditionTarget?.name ?? "другой игрок"} обменяетесь выбранной характеристикой. Остальные карты не изменятся.</b></div>
        <button className="primary big" disabled={!conditionTargetId || eligibleConditionIndexes.length === 0 || !eligibleConditionIndexes.includes(conditionCardIndex)} onClick={() => void useConditionCard()}>Подтвердить обмен →</button>
      </div></div>}

      {endingOpen && <div className="modal-backdrop ending-backdrop"><div className="modal ending-modal" role="dialog" aria-modal="true" aria-label="Финал игры"><span className="metal-bolt bolt-one" /><span className="metal-bolt bolt-two" /><span className="metal-bolt bolt-three" /><span className="metal-bolt bolt-four" /><div className="ending-seal">{scenario.icon}</div><span className="eyebrow">ПРОТОКОЛ «КОВЧЕГ» · ФИНАЛ</span><h2>{gameEnding.title}</h2><p>{gameEnding.verdict}</p><div className="survivor-list"><small>В БУНКЕР ВОШЛИ</small>{gameEnding.survivors.map((player) => <article key={player.name}><div className={`avatar ${player.color}`}>{player.avatar}</div><span><b>{player.name}</b><small>{characterCards[player.name]?.[0]}</small></span></article>)}</div><div className="ending-systems"><span className={gameEnding.hasMedicine ? "online" : "offline"}>✚ Медицина</span><span className={gameEnding.hasEngineering ? "online" : "offline"}>⚙ Инженерия</span><span className={gameEnding.hasFood ? "online" : "offline"}>♨ Пища</span></div><div className="ending-analysis"><section><small>СИЛЬНЫЕ СТОРОНЫ ВЫБРАННОГО СОСТАВА</small>{gameEnding.reasons.length ? gameEnding.reasons.map((item) => <span key={item}>✓ {item}</span>) : <span>— Критических компетенций не найдено</span>}</section><section><small>РИСКИ ВЫБРАННОГО СОСТАВА</small>{gameEnding.weaknesses.length ? gameEnding.weaknesses.map((item) => <span key={item}>! {item}</span>) : <span>— Критических пробелов не обнаружено</span>}</section></div><blockquote>«Голосование завершено. Теперь выбранному составу предстоит доказать, что решение было верным.»</blockquote><div className="ending-actions"><button className="secondary big" onClick={() => { setEndingOpen(false); setScreen("home"); }}>На главную</button><button className="primary big" onClick={() => prepareNewGame()}>Новая партия →</button></div></div></div>}
      {eventCard && <div className="event-reveal-backdrop" role="dialog" aria-modal="true" aria-label={`Событие: ${eventCard.title}`}>
        <div className="event-playing-card">
          <span className="paper-fold fold-one" /><span className="paper-fold fold-two" /><span className="paper-stain stain-one" /><span className="paper-stain stain-two" />
          <span className="event-card-corner top"><b>{String(eventCard.number).padStart(2, "0")}</b>{scenario.icon}</span>
          <div className="event-card-stamp">СОБЫТИЕ РАУНДА {round}</div>
          <span className="event-card-kicker">КОЛОДА «{scenario.title.split(":")[0]}»</span>
          <div className="event-card-symbol">{scenario.icon}</div>
          <h2>{eventCard.title}</h2>
          <p>{eventCard.message}</p>
          <div className="event-consequence"><small>ПОСЛЕДСТВИЕ</small><b>{eventCard.consequence}</b></div>
          <button onClick={() => { localStorage.setItem(`${SESSION_KEY}:seen-event:${code}`, String(eventCard.id)); setEventCard(null); if (!endingOpen) setRunning(true); }}>Принять событие <span>→</span></button>
          <span className="event-card-corner bottom"><b>{String(eventCard.number).padStart(2, "0")}</b>{scenario.icon}</span>
        </div>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
