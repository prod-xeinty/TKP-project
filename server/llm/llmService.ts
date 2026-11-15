import { GoogleGenAI, Type } from '@google/genai';
import {
  BrainstormMessage,
  MarketRecord,
  MessageType,
  TkpEdit,
  TradingSession,
} from '../../src/types';
import {
  calculateSessionTotalPrice,
  generateReplyAnalysisAndEdits,
} from '../../src/services/advisorEngine';

/**
 * Инициализация серверного клиента Gemini API согласно требованиям безопасности (.env)
 */
function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * LLM-слой (Раздел 9.3 и 10 ТЗ):
 * - Формирование промптов (входные данные: контекст, история, текущее ТКП, отклонённые правки как negative constraints, справочник)
 * - Явное разделение фактов (fact) и предположений (assumption)
 * - Исключение пунктов со статусом «невыполнимо» (infeasible)
 * - Вызов внешнего LLM-API с валидацией JSON-структуры и резервной обработкой ошибок
 */
export async function analyzeUtteranceWithLlm(params: {
  session: TradingSession;
  messageText: string;
  messageType: MessageType;
  linkedTkpItemId?: string;
  directory: MarketRecord[];
}): Promise<{
  message: BrainstormMessage;
  newEdits: TkpEdit[];
}> {
  const { session, messageText, messageType, linkedTkpItemId, directory } = params;
  const ai = getGenAiClient();

  if (!ai) {
    return generateReplyAnalysisAndEdits(params);
  }

  const feasibleItems = session.items.filter((i) => i.feasibility !== 'infeasible');
  const infeasibleItems = session.items.filter((i) => i.feasibility === 'infeasible');
  const totalPrice = calculateSessionTotalPrice(session.items);

  const systemInstruction = `Ты — аналитическое ядро системы поддержки принятия решений «ТКП-Советник» для индивидуального предпринимателя (ИП).
Твоя главная цель — помочь предпринимателю продать технико-коммерческое предложение (ТКП) как можно дороже, сохраняя предложение реалистичным и привлекательным для клиента.

Строгие правила промптинга (Раздел 10.3 ТЗ):
1. Явно разделяй подтверждённые факты (kind: "fact") и предположения (kind: "assumption").
2. Строго соблюдай Negative Constraints (ранее отклонённые правки): НЕ предлагай повторно отклонённые уступки без предупреждения.
3. Пункты ТКП со статусом "infeasible" (невыполнимо) ЗАПРЕЩЕНО предлагать в правках.
4. При аргументации ссылайся на ID записей справочника рыночных аналогов (usedDirectoryIds).
5. Предлагай 1–2 конкретные единичные правки ТКП (type: "price" | "deadline" | "scope" | "payment_terms" | "warranty" | "wording"), а не переписывай всё ТКП.`;

  const promptPayload = {
    context: session.context,
    currentTotalPrice: totalPrice,
    feasibleTkpItems: feasibleItems,
    excludedInfeasibleItems: infeasibleItems.map((i) => ({ code: i.code, title: i.title })),
    negativeConstraintsRejections: session.rejections,
    marketDirectory: directory.map((d) => ({
      id: d.id,
      analogName: d.analogName,
      priceRange: `${d.priceMin}-${d.priceMax}`,
      reliability: d.reliability,
      conditions: d.conditions,
    })),
    incomingUtterance: {
      type: messageType,
      text: messageText,
      linkedTkpItemId,
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Проанализируй новую реплику в сессии торга и верни JSON:\n${JSON.stringify(promptPayload, null, 2)}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            interpretation: { type: Type.STRING },
            motives: { type: Type.STRING },
            constraints: { type: Type.STRING },
            priorities: { type: Type.STRING },
            statements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
            risks: { type: Type.ARRAY, items: { type: Type.STRING } },
            opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.INTEGER },
            usedDirectoryIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            proposedEdits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  linkedTkpItemId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  currentValue: { type: Type.STRING },
                  proposedValue: { type: Type.STRING },
                  priceDelta: { type: Type.NUMBER },
                  attractivenessDelta: { type: Type.NUMBER },
                  rationale: { type: Type.STRING },
                  expectedEffect: { type: Type.STRING },
                  goalConflictWarning: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return generateReplyAnalysisAndEdits(params);
    }

    const parsed = JSON.parse(rawText);
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const msgId = `msg-${Date.now()}`;
    const analysisId = `an-${Date.now()}`;

    const validEdits: TkpEdit[] = (parsed.proposedEdits || []).map((e: any, idx: number) => ({
      id: `edit-${Date.now()}-${idx + 1}`,
      sessionId: session.id,
      messageId: msgId,
      linkedTkpItemId: e.linkedTkpItemId || linkedTkpItemId || feasibleItems[0]?.id,
      type: ['price', 'deadline', 'scope', 'payment_terms', 'warranty', 'wording'].includes(e.type)
        ? e.type
        : 'wording',
      title: String(e.title || 'Точечная правка ТКП'),
      currentValue: String(e.currentValue || 'Текущая редакция ТКП'),
      proposedValue: String(e.proposedValue || 'Уточнённая редакция'),
      priceDelta: Number(e.priceDelta) || 0,
      attractivenessDelta: Number(e.attractivenessDelta) || 5,
      rationale: String(e.rationale || 'Обосновано контекстом переговоров.'),
      expectedEffect: String(e.expectedEffect || 'Укрепление переговорной позиции.'),
      status: 'proposed',
      goalConflictWarning: e.goalConflictWarning ? String(e.goalConflictWarning) : undefined,
      usedDirectoryIds: Array.isArray(parsed.usedDirectoryIds)
        ? parsed.usedDirectoryIds
        : directory.slice(0, 2).map((d) => d.id),
      createdAt: nowStr,
    }));

    const message: BrainstormMessage = {
      id: msgId,
      sessionId: session.id,
      type: messageType,
      authorLabel: messageType === 'thought' ? 'Моё размышление (ИП)' : 'Реплика клиента (модель)',
      text: messageText,
      createdAt: nowStr,
      linkedTkpItemId,
      analysis: {
        id: analysisId,
        messageId: msgId,
        interpretation: String(parsed.interpretation || ''),
        clientPosition: {
          motives: String(parsed.motives || ''),
          constraints: String(parsed.constraints || ''),
          priorities: String(parsed.priorities || ''),
        },
        statements: (parsed.statements || []).map((st: any, idx: number) => ({
          id: `st-${Date.now()}-${idx}`,
          kind: st.kind === 'fact' ? 'fact' : 'assumption',
          text: String(st.text || ''),
        })),
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.map(String) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        confidence: Number(parsed.confidence) || 85,
        usedDirectoryIds: Array.isArray(parsed.usedDirectoryIds)
          ? parsed.usedDirectoryIds.map(String)
          : directory.slice(0, 2).map((d) => d.id),
      },
    };

    return {
      message,
      newEdits: validEdits.length > 0 ? validEdits : generateReplyAnalysisAndEdits(params).newEdits,
    };
  } catch {
    // При недоступности внешнего LLM возвращаем результат локального анализатора без потери введённых данных (п. 10.4 ТЗ)
    return generateReplyAnalysisAndEdits(params);
  }
}
