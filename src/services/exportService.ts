import { MarketRecord, TradingSession } from '../types';
import { calculateFeasibilityScore, calculateSessionTotalPrice } from './advisorEngine';

/**
 * Формирует Markdown-документ с текущим ТКП, отметками реалистичности,
 * историей правок, журналом отклонений и сводными метриками торга (раздел 6.4 и 7.10 ТЗ).
 */
export function buildSessionMarkdownReport(session: TradingSession, directory: MarketRecord[]): string {
  const currentPrice = calculateSessionTotalPrice(session.items);
  const priceDelta = currentPrice - session.initialPrice;
  const feasibility = calculateFeasibilityScore(session.items);
  const latestEval = session.evaluations[session.evaluations.length - 1];
  const attractiveness = latestEval ? latestEval.attractivenessScore : 75;

  const acceptedEdits = session.edits.filter((e) => e.status === 'accepted');
  const rejectedEdits = session.edits.filter((e) => e.status === 'rejected');

  const lines: string[] = [
    `# Технико-коммерческое предложение и паспорт торга`,
    `**Проект / Сессия:** ${session.title}`,
    `**Заказчик:** ${session.clientName} (${session.context.industry})`,
    `**ЛПР:** ${session.context.decisionMaker}`,
    `**Дата формирования выгрузки:** ${new Date().toLocaleString('ru-RU')}`,
    ``,
    `---`,
    ``,
    `## 1. Сводные показатели сделки`,
    `- **Стартовая стоимость ТКП:** ${session.initialPrice.toLocaleString('ru-RU')} ₽`,
    `- **Текущая согласуемая стоимость ТКП:** ${currentPrice.toLocaleString('ru-RU')} ₽ (${priceDelta >= 0 ? `+${priceDelta.toLocaleString('ru-RU')}` : priceDelta.toLocaleString('ru-RU')} ₽ к старту)`,
    `- **Бюджетный коридор клиента:** ${session.context.budgetMin.toLocaleString('ru-RU')} – ${session.context.budgetMax.toLocaleString('ru-RU')} ₽`,
    `- **Целевой срок:** ${session.context.deadlines}`,
    `- **Индекс реалистичности (подтверждение ИП):** ${feasibility}%`,
    `- **Оценка привлекательности для клиента (LLM):** ${attractiveness}/100`,
    `- **Циклов торга проведено:** ${session.evaluations.length}`,
    ``,
    `## 2. Актуальный состав ТКП и проверка выполнимости`,
    `| Код | Наименование и результат | Срок (дн.) | Стоимость (₽) | Выполнимость (ИП) | Комментарий |`,
    `| :--- | :--- | :---: | :---: | :---: | :--- |`,
  ];

  for (const item of session.items) {
    const statusLabel =
      item.feasibility === 'feasible'
        ? 'Выполнимо'
        : item.feasibility === 'questionable'
        ? 'Под вопросом'
        : 'НЕВЫПОЛНИМО (исключено)';
    lines.push(
      `| ${item.code} | **${item.title}** — ${item.value} | ${item.durationDays} | ${item.cost.toLocaleString('ru-RU')} | ${statusLabel} | ${item.comment} |`
    );
  }

  lines.push(
    ``,
    `## 3. История принятых правок ТКП (${acceptedEdits.length})`,
    acceptedEdits.length === 0
      ? `_Принятых правок пока нет._`
      : acceptedEdits
          .map(
            (e, idx) =>
              `${idx + 1}. **[${e.type.toUpperCase()}] ${e.title}**\n   - *Было:* ${e.currentValue}\n   - *Стало:* ${e.proposedValue}\n   - *Влияние на цену:* ${e.priceDelta >= 0 ? `+${e.priceDelta.toLocaleString('ru-RU')}` : e.priceDelta.toLocaleString('ru-RU')} ₽\n   - *Обоснование:* ${e.rationale}`
          )
          .join('\n\n'),
    ``,
    `## 4. Журнал отклонённых правок (Negative Constraints — ${rejectedEdits.length})`,
    rejectedEdits.length === 0
      ? `_Отклонённых правок нет._`
      : rejectedEdits
          .map(
            (e, idx) =>
              `${idx + 1}. **${e.title}** (${e.proposedValue})\n   - *Причина отклонения ИП:* ${e.rejectionReason || 'Не указана'}`
          )
          .join('\n\n'),
    ``,
    `## 5. Использованные рыночные аналоги (${directory.length} записей в базе)`,
    ...directory.map(
      (d) =>
        `- **${d.analogName}**: ${d.priceMin.toLocaleString('ru-RU')} – ${d.priceMax.toLocaleString('ru-RU')} ₽ (${d.reliability === 'fact' ? 'Факт' : 'Предположение'}, дата: ${d.fetchedAt}, источник: ${d.sourceTitle})`
    )
  );

  return lines.join('\n');
}

/**
 * Формирует самодостаточный HTML-документ для печати / сохранения в PDF/Word
 */
export function buildSessionHtmlReport(session: TradingSession): string {
  const currentPrice = calculateSessionTotalPrice(session.items);
  const priceDelta = currentPrice - session.initialPrice;
  const feasibility = calculateFeasibilityScore(session.items);
  const latestEval = session.evaluations[session.evaluations.length - 1];
  const attractiveness = latestEval ? latestEval.attractivenessScore : 75;

  const rowsHtml = session.items
    .map((item) => {
      const statusText =
        item.feasibility === 'feasible'
          ? 'Выполнимо'
          : item.feasibility === 'questionable'
          ? 'Под вопросом'
          : 'Невыполнимо (исключено)';
      return `
        <tr>
          <td>${item.code}</td>
          <td><strong>${item.title}</strong><br/><span style="color:#475569;font-size:12px;">${item.value}</span></td>
          <td style="text-align:right;font-family:monospace;">${item.durationDays}</td>
          <td style="text-align:right;font-family:monospace;">${item.cost.toLocaleString('ru-RU')} ₽</td>
          <td>${statusText}</td>
        </tr>`;
    })
    .join('');

  const editsHtml = session.edits
    .map(
      (e) => `
      <tr>
        <td>${e.title}</td>
        <td>${e.status === 'accepted' ? 'Принята' : e.status === 'rejected' ? 'Отклонена' : e.status === 'deferred' ? 'Отложена' : 'Предложена'}</td>
        <td style="text-align:right;font-family:monospace;">${e.priceDelta >= 0 ? `+${e.priceDelta.toLocaleString('ru-RU')}` : e.priceDelta.toLocaleString('ru-RU')} ₽</td>
        <td>${e.rejectionReason ? `Причина отказа: ${e.rejectionReason}` : e.rationale}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>ТКП — ${session.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; max-width: 960px; margin: 32px auto; padding: 0 24px; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
    .meta { color: #475569; font-size: 14px; margin-bottom: 20px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; }
    .kpi-label { font-size: 12px; color: #64748b; }
    .kpi-val { font-size: 18px; font-weight: 700; font-family: monospace; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Технико-коммерческое предложение: ${session.title}</h1>
  <div class="meta">
    Заказчик: <strong>${session.clientName}</strong> · Отрасль: ${session.context.industry} · ЛПР: ${session.context.decisionMaker}
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Итоговая стоимость ТКП</div>
      <div class="kpi-val">${currentPrice.toLocaleString('ru-RU')} ₽</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Прирост к старту</div>
      <div class="kpi-val">${priceDelta >= 0 ? `+${priceDelta.toLocaleString('ru-RU')}` : priceDelta.toLocaleString('ru-RU')} ₽</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Реалистичность (ИП)</div>
      <div class="kpi-val">${feasibility}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Привлекательность (LLM)</div>
      <div class="kpi-val">${attractiveness} / 100</div>
    </div>
  </div>

  <h2>1. Спецификация работ и контроль реалистичности</h2>
  <table>
    <thead>
      <tr>
        <th>Код</th>
        <th>Наименование и состав работ</th>
        <th>Дней</th>
        <th>Стоимость</th>
        <th>Статус выполнимости</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <h2>2. Журнал правок и аргументации торга</h2>
  <table>
    <thead>
      <tr>
        <th>Правка</th>
        <th>Статус</th>
        <th>Дельта цены</th>
        <th>Обоснование / Причина отклонения</th>
      </tr>
    </thead>
    <tbody>
      ${editsHtml}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Скачивает текстовый файл на компьютер пользователя
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
