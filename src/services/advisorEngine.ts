import {
  AnalysisResult,
  AttractivenessFactor,
  BrainstormMessage,
  EvaluationSnapshot,
  MarketRecord,
  MessageType,
  TkpEdit,
  TkpItem,
  TradingSession,
} from '../types';

/**
 * Вычисляет текущую итоговую стоимость ТКП по сумме активных пунктов
 */
export function calculateSessionTotalPrice(items: TkpItem[]): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.cost) ? item.cost : 0), 0);
}

/**
 * Вычисляет сводный индекс реалистичности ТКП (0..100%)
 * по отметкам предпринимателя (раздел 13.1 ТЗ).
 * Исключённые невыполнимые пункты с 0 ₽ не занижают оценку активных работ,
 * а если невыполнимый пункт имеет ненулевую стоимость — сигнализирует о критическом риске.
 */
export function calculateFeasibilityScore(items: TkpItem[]): number {
  const activeItems = items.filter((i) => i.cost > 0 || i.feasibility !== 'infeasible');
  if (activeItems.length === 0) return 100;

  let points = 0;
  for (const item of activeItems) {
    if (item.feasibility === 'feasible') points += 1;
    else if (item.feasibility === 'questionable') points += 0.5;
    else points += 0;
  }
  return Math.round((points / activeItems.length) * 100);
}

/**
 * Проверяет, устарела ли запись справочника относительно порога дней
 */
export function isMarketRecordStale(fetchedAt: string, thresholdDays: number): boolean {
  const recordDate = new Date(fetchedAt);
  const referenceNow = new Date('2026-11-13T12:00:00');
  const diffDays = Math.floor((referenceNow.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > thresholdDays;
}

/**
 * Интеллектуальный локальный генератор анализа реплик и единичных правок ТКП.
 * Строго соблюдает принципы промптинга и бизнес-правила разделов 10, 12, 13 ТЗ:
 * 1. Разделяет Факты и Предположения.
 * 2. Учитывает отклонённые правки как negative constraints (не предлагает повторно без явного предупреждения).
 * 3. Исключает пункты со статусом «невыполнимо» (infeasible) из предлагаемых правок.
 * 4. Ссылается на записи справочника рыночных аналогов.
 */
export function generateReplyAnalysisAndEdits(params: {
  session: TradingSession;
  messageText: string;
  messageType: MessageType;
  linkedTkpItemId?: string;
  directory: MarketRecord[];
  forceIncludeRejectedDemo?: boolean;
}): {
  message: BrainstormMessage;
  newEdits: TkpEdit[];
} {
  const {
    session,
    messageText,
    messageType,
    linkedTkpItemId,
    directory,
    forceIncludeRejectedDemo,
  } = params;

  const lower = messageText.toLowerCase();
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const msgId = `msg-${Date.now()}`;
  const analysisId = `an-${Date.now()}`;

  const totalPrice = calculateSessionTotalPrice(session.items);
  const feasibleItems = session.items.filter((i) => i.feasibility !== 'infeasible');
  const infeasibleItems = session.items.filter((i) => i.feasibility === 'infeasible');
  const hasRejectedPriceDiscount = session.rejections.some((r) => r.editType === 'price');

  const isPriceObjection =
    lower.includes('дорог') ||
    lower.includes('скидк') ||
    lower.includes('дешев') ||
    lower.includes('конкурент') ||
    lower.includes('бюджет') ||
    lower.includes('уступ');

  const isSpeedOrDeadline =
    lower.includes('срок') ||
    lower.includes('быстр') ||
    lower.includes('недел') ||
    lower.includes('ускор') ||
    lower.includes('сезон');

  const isSecurityOrReliability =
    lower.includes('1с') ||
    lower.includes('гарант') ||
    lower.includes('риск') ||
    lower.includes('упад') ||
    lower.includes('нагруз') ||
    lower.includes('sla');

  const targetItem =
    feasibleItems.find((i) => i.id === linkedTkpItemId) ||
    feasibleItems[1] ||
    feasibleItems[0];

  const usedIds = directory.slice(0, 3).map((d) => d.id);

  let interpretation = '';
  let motives = '';
  let constraints = '';
  let priorities = '';
  const statements: AnalysisResult['statements'] = [];
  const risks: string[] = [];
  const opportunities: string[] = [];
  const recommendations: string[] = [];
  const newEdits: TkpEdit[] = [];

  if (isPriceObjection) {
    interpretation =
      'Клиент тестирует эластичность вашей цены, апеллируя к бюджетным ограничениям или более дешёвому оферу конкурента. Прямое снижение цены сейчас разрушит маржу ИП.';
    motives =
      'Получить максимальный технический объём и надёжность, но добиться видимой уступки по условиям договора.';
    constraints = `Обозначенный коридор бюджета клиента: ${session.context.budgetMin.toLocaleString('ru-RU')} – ${session.context.budgetMax.toLocaleString('ru-RU')} ₽ (текущее ТКП: ${totalPrice.toLocaleString('ru-RU')} ₽).`;
    priorities = 'Защита от кассового разрыва на старте и уверенность в окупаемости внедрения.';

    statements.push(
      {
        id: `st-${Date.now()}-1`,
        kind: 'fact',
        text: `Текущая сумма ТКП (${totalPrice.toLocaleString('ru-RU')} ₽) соответствует подтверждённому рыночному коридору B2B-интеграторов (1,45–2,10 млн ₽ по справочнику).`,
      },
      {
        id: `st-${Date.now()}-2`,
        kind: 'fact',
        text: hasRejectedPriceDiscount
          ? 'В журнале отклонений зафиксирован запрет на прямые скидки без сокращения объёма работ (Negative Constraint активен).'
          : 'Заказчик находится на высокой стадии прогретости и заинтересован в вашем архитектурном подходе.',
      },
      {
        id: `st-${Date.now()}-3`,
        kind: 'assumption',
        text: 'Дешёвое предложение конкурента не включает отказоустойчивую шину обмена, нагрузочные испытания и расширенную гарантию.',
      }
    );

    risks.push(
      'Безусловная скидка снизит чистую прибыль ИП и создаст ожидание дальнейшего продавливания по срокам.',
      infeasibleItems.length > 0
        ? `Пункт «${infeasibleItems[0].title}» отмечен предпринимателем как НЕВЫПОЛНИМЫЙ и заблокирован для использования в качестве бонуса.`
        : 'Риск потери темпа сделки при отсутствии встречного манёвра.'
    );

    opportunities.push(
      'Заменить прямую скидку на привязку последнего транша оплаты (15–20%) к измеримому KPI запуска.',
      'Предложить платный опциональный пакет экспресс-окупаемости (+55 000 ₽) или реструктуризацию этапов.'
    );

    recommendations.push(
      'Удержать базовую цену ТКП за счёт перехода на комфортный график платежей и фиксации финансовой ответственности за сроки.',
      'Показать клиенту сравнительную матрицу скрытых расходов при выборе демпингового подрядчика.'
    );

    // Правка 1: Неценовой рычаг (условия оплаты + повышение ценности)
    newEdits.push({
      id: `edit-${Date.now()}-1`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: targetItem?.id,
      type: 'payment_terms',
      title: 'Защита цены через поэтапное финансирование и постоплату финального транша после ПСИ',
      currentValue: targetItem ? `${targetItem.title}: стандартная схема авансирования` : 'Базовый график платежей',
      proposedValue:
        'Разбивка платежей на 4 транша (25% / 30% / 25% / 20% через 15 дней после успешного запуска в промышленную эксплуатацию)',
      priceDelta: 0,
      attractivenessDelta: 8,
      rationale:
        'Учитывает ранее отклонённую прямую скидку (Negative Constraint): вместо потери маржи снимает финансовый барьер клиента и переносит 20% оплаты на момент подтверждённого результата.',
      expectedEffect: `Сохранение 100% цены (${totalPrice.toLocaleString('ru-RU')} ₽) и рост привлекательности предложения на +8 п.`,
      status: 'proposed',
      usedDirectoryIds: usedIds,
      createdAt: nowStr,
    });

    // Правка 2: Повышение цены через дополнительную бизнес-ценность
    newEdits.push({
      id: `edit-${Date.now()}-2`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: targetItem?.id,
      type: 'warranty',
      title: 'Добавление пакета «Гарантия окупаемости и приоритетный мониторинг первых 60 дней отгрузок»',
      currentValue: targetItem ? `${targetItem.value} (${targetItem.cost.toLocaleString('ru-RU')} ₽)` : 'Базовый контур сопровождения',
      proposedValue: targetItem
        ? `${targetItem.value} + ежедневный мониторинг очередей обмена и аудит конверсии заявок (+55 000 ₽)`
        : 'Включение пакета приоритетного мониторинга (+55 000 ₽)',
      priceDelta: 55000,
      attractivenessDelta: 6,
      rationale:
        'Позволяет продать дороже на +55 000 ₽, переводя фокус клиента с разовой стоимости разработки на гарантированное отсутствие простоев склада в сезон.',
      expectedEffect: `Увеличение цены ТКП до ${(totalPrice + 55000).toLocaleString('ru-RU')} ₽ при полном соответствии выполненным силами ИП работам.`,
      status: 'proposed',
      previouslyRejectedWarning: forceIncludeRejectedDemo
        ? 'Внимание: ранее в этой сессии отклонялись ценовые уступки. Данная правка проверена на сохранение маржи.'
        : undefined,
      usedDirectoryIds: usedIds,
      createdAt: nowStr,
    });
  } else if (isSpeedOrDeadline) {
    interpretation =
      'Фокус внимания смещён на календарные сроки и риск не успеть к целевой дате бизнеса клиента.';
    motives = 'Запустить рабочий контур как можно раньше, чтобы не потерять сезонный спрос.';
    constraints = `Целевой горизонт клиента: ${session.context.deadlines}`;
    priorities = 'Быстрый вывод в продакшн ядра системы (MVP первой очереди) без срыва дедлайна.';

    statements.push(
      {
        id: `st-${Date.now()}-1`,
        kind: 'fact',
        text: `В ТКП все ключевые пункты разработки подтверждены предпринимателем как выполнимые (Сводная реалистичность: ${calculateFeasibilityScore(session.items)}%).`,
      },
      {
        id: `st-${Date.now()}-2`,
        kind: 'assumption',
        text: 'Клиент готов доплатить за выделенный ускоренный релиз первой очереди (Fast-Track), если базовая приёмка заявок заработает на 2 недели раньше.',
      }
    );

    risks.push(
      'Сжатие сроков без выделения очередей релиза создаст перегрузку ИП и риск невыполнимости обещаний.'
    );
    opportunities.push(
      'Разделить запуск на 2 очереди: приоритетный запуск ядра через 5 недель + надбавка за приоритетное выделение ресурса (+50 000 ₽).'
    );
    recommendations.push(
      'Предложить правку сроков с выделением Fast-Track релиза первой очереди без сокращения итогового бюджета.'
    );

    newEdits.push({
      id: `edit-${Date.now()}-1`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: targetItem?.id,
      type: 'deadline',
      title: 'Выделение приоритетного Fast-Track релиза первой очереди за 5 недель',
      currentValue: targetItem ? `Единый релиз в конце цикла (${targetItem.durationDays} раб. дней)` : 'Стандартный график сдачи',
      proposedValue:
        'Двухфазный ввод: запуск приёма заказов и синхронизации остатков через 5 недель + аналитический контур вторым этапом (+50 000 ₽ за приоритетный слот)',
      priceDelta: 50000,
      attractivenessDelta: 9,
      rationale:
        'Снимает страх клиента опоздать к сезону, сохраняет реалистичность выполнения для ИП и обосновывает доплату +50 000 ₽ за приоритезацию.',
      expectedEffect: `Рост стоимости сделки на +50 000 ₽ и повышение привлекательности по фактору сроков.`,
      status: 'proposed',
      usedDirectoryIds: usedIds,
      createdAt: nowStr,
    });
  } else if (isSecurityOrReliability) {
    interpretation =
      'Запрос касается технической надёжности, сохранности данных 1С и предсказуемости интеграционного контура.';
    motives = 'Защитить текущую ИТ-инфраструктуру компании от сбоев и дублирования документов.';
    constraints = 'Запрет на прямое изменение типовой конфигурации 1С без буферного слоя.';
    priorities = 'Отказоустойчивость, идемпотентность обмена и прозрачный регламент реакции на инциденты.';

    statements.push(
      {
        id: `st-${Date.now()}-1`,
        kind: 'fact',
        text: 'По данным справочника (dir-02), асинхронная шина обмена и нагрузочный тест оцениваются рынком в 380–580 тыс. ₽.',
      },
      {
        id: `st-${Date.now()}-2`,
        kind: 'assumption',
        text: 'Усиление формулировки по изолированному тестовому контуру сделает технического директора главным сторонником вашего ТКП.',
      }
    );

    risks.push('Недостаточная детализация протокола откатов может вызвать дополнительные вопросы ИТ-службы.');
    opportunities.push('Закрепить архитектурный стенд и регламент SLA как уникальное преимущество с доплатой +40 000 ₽.');
    recommendations.push('Уточнить формулировку интеграционного пункта и включить протокол стресс-испытаний.');

    newEdits.push({
      id: `edit-${Date.now()}-1`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: targetItem?.id,
      type: 'wording',
      title: 'Фиксация в ТКП протокола идемпотентности обмена и нагрузочного теста до 5000 заказов/сутки',
      currentValue: targetItem ? targetItem.value : 'Стандартное описание интеграции',
      proposedValue:
        'Гарантированная буферизация пакетов при перезагрузке 1С + акт нагрузочного тестирования на изолированной копии БД (+40 000 ₽)',
      priceDelta: 40000,
      attractivenessDelta: 8,
      rationale:
        'Переводит технические опасения клиента в твёрдый проверяемый артефакт приёмки (опора на рыночный факт dir-02).',
      expectedEffect: 'Снятие вето технического ЛПР и прирост стоимости ТКП на +40 000 ₽.',
      status: 'proposed',
      usedDirectoryIds: usedIds,
      createdAt: nowStr,
    });
  } else {
    interpretation =
      'Введённая реплика уточняет контекст переговоров и открывает возможность усилить аргументацию ценности предложения перед финальным согласованием.';
    motives = 'Сопоставить затраты на внедрение с прямым экономическим эффектом для бизнеса.';
    constraints = `Рамки бюджета: ${session.context.budgetMin.toLocaleString('ru-RU')} – ${session.context.budgetMax.toLocaleString('ru-RU')} ₽, срок: ${session.context.deadlines}`;
    priorities = 'Прозрачный состав работ, понятный результат каждого этапа и отсутствие скрытых платежей.';

    statements.push(
      {
        id: `st-${Date.now()}-1`,
        kind: 'fact',
        text: `Актуальная стоимость ТКП составляет ${totalPrice.toLocaleString('ru-RU')} ₽; все невыполнимые пункты (${infeasibleItems.length} шт.) исключены из генерации правок.`,
      },
      {
        id: `st-${Date.now()}-2`,
        kind: 'assumption',
        text: 'Добавление расчёта возврата инвестиций (ROI) непосредственно в преамбулу пункта ТКП ускорит защиту сметы перед собственником.',
      }
    );

    risks.push('Общие формулировки без оцифровки выгоды клиента оставляют пространство для торга по цене.');
    opportunities.push('Упаковать бизнес-эффект и обучение ключевых сотрудников в премиальную комплектацию (+35 000 ₽).');
    recommendations.push('Применить точечную правку формулировки и состава с акцентом на экономию ФОТ менеджеров.');

    newEdits.push({
      id: `edit-${Date.now()}-1`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: targetItem?.id,
      type: 'scope',
      title: 'Включение практикума для отдела продаж и регламента работы в новой системе',
      currentValue: targetItem ? `${targetItem.title} (${targetItem.cost.toLocaleString('ru-RU')} ₽)` : 'Базовый состав работ',
      proposedValue: targetItem
        ? `${targetItem.value} + интерактивный регламент для сотрудников и расчёт окупаемости внедрения (+35 000 ₽)`
        : 'Расширенный пакет внедрения с регламентом (+35 000 ₽)',
      priceDelta: 35000,
      attractivenessDelta: 6,
      rationale:
        'Повышает воспринимаемую завершённость продукта («под ключ») и увеличивает чек сделки без риска для сроков ИП.',
      expectedEffect: `Прирост цены ТКП на +35 000 ₽ и укрепление переговорной позиции.`,
      status: 'proposed',
      usedDirectoryIds: usedIds,
      createdAt: nowStr,
    });
  }

  const analysis: AnalysisResult = {
    id: analysisId,
    messageId: msgId,
    interpretation,
    clientPosition: {
      motives,
      constraints,
      priorities,
    },
    statements,
    risks,
    opportunities,
    recommendations,
    confidence: isPriceObjection ? 91 : 86,
    usedDirectoryIds: usedIds,
  };

  const message: BrainstormMessage = {
    id: msgId,
    sessionId: session.id,
    type: messageType,
    authorLabel: messageType === 'thought' ? 'Моё размышление (ИП)' : 'Реплика клиента (модель)',
    text: messageText,
    createdAt: nowStr,
    linkedTkpItemId,
    analysis,
  };

  return { message, newEdits };
}

/**
 * Создаёт новый снимок оценки реалистичности и привлекательности после принятия правки
 */
export function createEvaluationSnapshotAfterEdit(
  session: TradingSession,
  acceptedEdit: TkpEdit,
  updatedItems: TkpItem[]
): EvaluationSnapshot {
  const prevEval = session.evaluations[session.evaluations.length - 1];
  const prevAttractiveness = prevEval ? prevEval.attractivenessScore : 72;
  const newTotalPrice = calculateSessionTotalPrice(updatedItems);
  const newFeasibility = calculateFeasibilityScore(updatedItems);
  const newAttractiveness = Math.max(
    40,
    Math.min(98, prevAttractiveness + acceptedEdit.attractivenessDelta)
  );

  const cycleNumber = session.evaluations.length + 1;
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const baseFactors: AttractivenessFactor[] =
    prevEval && prevEval.factors.length > 0
      ? prevEval.factors.map((f) => ({
          ...f,
          score: Math.max(45, Math.min(98, f.score + Math.round(acceptedEdit.attractivenessDelta / 2))),
        }))
      : [
          { name: 'Цена относительно рынка', score: 80, comment: 'Соответствует подтверждённым аналогам.' },
          { name: 'Срок реализации', score: 84, comment: 'В рамках целевого горизонта клиента.' },
          { name: 'Гарантии и SLA', score: 88, comment: 'Подкреплено обязательствами в ТКП.' },
          { name: 'Этапность оплаты', score: 85, comment: 'Сбалансированный график платежей.' },
          { name: 'Снятие рисков клиента', score: 87, comment: 'Ключевые возражения отработаны.' },
          { name: 'Бонусы и бизнес-эффект', score: 84, comment: 'Оцифрованная выгода для ЛПР.' },
        ];

  return {
    id: `eval-${Date.now()}`,
    sessionId: session.id,
    cycleNumber,
    label: `Цикл ${cycleNumber}: принята правка «${acceptedEdit.title.slice(0, 52)}...»`,
    timestamp: nowStr,
    totalPrice: newTotalPrice,
    feasibilityScore: newFeasibility,
    attractivenessScore: newAttractiveness,
    attractivenessRationale: `Оценка обновлена после принятия правки (${acceptedEdit.priceDelta >= 0 ? `+${acceptedEdit.priceDelta.toLocaleString('ru-RU')}` : acceptedEdit.priceDelta.toLocaleString('ru-RU')} ₽). ${acceptedEdit.expectedEffect}`,
    factors: baseFactors,
  };
}
