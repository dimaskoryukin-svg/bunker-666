export type ConditionCard = {
  id: string;
  title: string;
  description: string;
  allowedCardIndexes: number[];
  restriction: "any" | "closed" | "revealed";
};

export type ConditionAction = {
  id: number;
  player_id: string;
  player_name: string;
  target_player_id: string;
  target_name: string;
  condition_id: string;
  card_index: number;
  created_at: number;
};

export const traitLabels = ["Профессия", "Здоровье", "Биология", "Хобби", "Багаж", "Особенность"] as const;

export const conditionCards: ConditionCard[] = [
  { id: "health-exchange", title: "Обмен диагнозами", description: "Один раз за игру обменяйтесь картой «Здоровье» с любым оставшимся игроком.", allowedCardIndexes: [1], restriction: "any" },
  { id: "profession-exchange", title: "Смена специализации", description: "Один раз за игру обменяйтесь картой «Профессия» с другим игроком.", allowedCardIndexes: [0], restriction: "any" },
  { id: "baggage-exchange", title: "Бартер ресурсов", description: "Один раз за игру обменяйтесь картой «Багаж» с другим игроком.", allowedCardIndexes: [4], restriction: "any" },
  { id: "hobby-exchange", title: "Обмен опытом", description: "Один раз за игру обменяйтесь картой «Хобби» с другим игроком.", allowedCardIndexes: [3], restriction: "any" },
  { id: "biology-exchange", title: "Смена биографии", description: "Один раз за игру обменяйтесь картой «Биология» с другим игроком.", allowedCardIndexes: [2], restriction: "any" },
  { id: "special-exchange", title: "Переписанное досье", description: "Один раз за игру обменяйтесь картой «Особенность» с другим игроком.", allowedCardIndexes: [5], restriction: "any" },
  { id: "medical-choice", title: "Медицинский консилиум", description: "Обменяйте с другим игроком либо «Здоровье», либо «Особенность».", allowedCardIndexes: [1, 5], restriction: "any" },
  { id: "career-choice", title: "Профессиональная рокировка", description: "Обменяйте с другим игроком либо «Профессию», либо «Хобби».", allowedCardIndexes: [0, 3], restriction: "any" },
  { id: "resource-choice", title: "Перераспределение ресурсов", description: "Обменяйте с другим игроком либо «Багаж», либо «Хобби».", allowedCardIndexes: [3, 4], restriction: "any" },
  { id: "identity-choice", title: "Коррекция профиля", description: "Обменяйте с другим игроком либо «Биологию», либо «Особенность».", allowedCardIndexes: [2, 5], restriction: "any" },
  { id: "risk-choice", title: "Равный риск", description: "Обменяйте с другим игроком либо «Здоровье», либо «Багаж».", allowedCardIndexes: [1, 4], restriction: "any" },
  { id: "free-exchange", title: "Свободная сделка", description: "Один раз за игру выберите любую одну характеристику и обменяйтесь ею с другим игроком.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "any" },
  { id: "closed-exchange", title: "Слепой контракт", description: "Обменяйтесь с другим игроком одной характеристикой, которая ещё не раскрыта у вас обоих.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "closed" },
  { id: "revealed-exchange", title: "Открытая договорённость", description: "Обменяйтесь с другим игроком одной характеристикой, уже раскрытой у вас обоих.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "revealed" },
  { id: "survival-pact", title: "Пакт выживания", description: "Выберите между обменом «Профессии», «Здоровья» или «Багажа» с другим игроком.", allowedCardIndexes: [0, 1, 4], restriction: "any" },
  { id: "personal-revision", title: "Пересмотр личности", description: "Выберите между обменом «Биологии», «Хобби» или «Особенности».", allowedCardIndexes: [2, 3, 5], restriction: "any" },
  { id: "practical-deal", title: "Практическая сделка", description: "Обменяйте «Профессию», «Хобби» или «Багаж» с другим игроком.", allowedCardIndexes: [0, 3, 4], restriction: "any" },
  { id: "human-factor", title: "Человеческий фактор", description: "Обменяйте «Здоровье», «Биологию» или «Особенность» с другим игроком.", allowedCardIndexes: [1, 2, 5], restriction: "any" },
  { id: "mutual-aid", title: "Взаимопомощь", description: "Обменяйте «Здоровье», «Хобби» или «Багаж» с другим игроком.", allowedCardIndexes: [1, 3, 4], restriction: "any" },
  { id: "new-role", title: "Новая роль", description: "Обменяйте «Профессию», «Биологию» или «Особенность» с другим игроком.", allowedCardIndexes: [0, 2, 5], restriction: "any" },
  { id: "last-bargain", title: "Последний торг", description: "До финального раунда обменяйте любую одну характеристику с другим игроком.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "any" },
  { id: "verified-barter", title: "Проверенный бартер", description: "Обменяйтесь одной уже раскрытой характеристикой с другим игроком.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "revealed" },
  { id: "secret-barter", title: "Тайный бартер", description: "Обменяйтесь одной ещё не раскрытой характеристикой с другим игроком.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "closed" },
  { id: "balanced-choice", title: "Баланс группы", description: "Выберите любую характеристику, которой группе не хватает, и обменяйтесь соответствующей картой с другим игроком.", allowedCardIndexes: [0, 1, 2, 3, 4, 5], restriction: "any" },
];

export function conditionCardFor(seed: number, seat: number): ConditionCard {
  const index = Math.abs(seed * 17 + seat * 29 + 11) % conditionCards.length;
  return conditionCards[index];
}

export function applyConditionActions(
  cards: Record<string, string[]>,
  actions: ConditionAction[],
): Record<string, string[]> {
  const result = Object.fromEntries(Object.entries(cards).map(([name, values]) => [name, [...values]]));
  for (const action of actions) {
    const actor = result[action.player_name];
    const target = result[action.target_name];
    if (!actor || !target || action.card_index < 0 || action.card_index >= traitLabels.length) continue;
    const previous = actor[action.card_index];
    actor[action.card_index] = target[action.card_index];
    target[action.card_index] = previous;
  }
  return result;
}
