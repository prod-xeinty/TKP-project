import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AppSettings,
  BrainstormMessage,
  EditStatus,
  MarketRecord,
  MessageType,
  TkpEdit,
  TradingSession,
} from '../types';
import {
  calculateFeasibilityScore,
  calculateSessionTotalPrice,
} from '../services/advisorEngine';
import { TabHeroHeader } from './AnimatedText';

interface WorkspaceViewProps {
  session: TradingSession;
  directory: MarketRecord[];
  settings: AppSettings;
  onAddReplyAndAnalyze: (
    payload: {
      text: string;
      type: MessageType;
      linkedTkpItemId?: string;
    },
    signal?: AbortSignal
  ) => Promise<void>;
  onAcceptEdit: (editId: string) => void;
  onRejectEdit: (editId: string, reason: string) => void;
  onDeferEdit: (editId: string) => void;
  onNavigateToScreen: (screen: 'tkp' | 'directory' | 'metrics' | 'context') => void;
}

const QUICK_SCENARIOS: {
  id: string;
  label: string;
  type: MessageType;
  text: string;
}[] = [
  {
    id: 'sc-1',
    label: '«У конкурента дешевле на 25%»',
    type: 'client_reply',
    text: 'Коммерческий директор: «Нам прислали смету от другой команды за 1 250 000 ₽. Ваше предложение нравится больше, но руководство просит скидку хотя бы 200–250 тысяч ₽ для подписания».',
  },
  {
    id: 'sc-2',
    label: '«Нужен запуск быстрее — за 5 недель»',
    type: 'client_reply',
    text: 'ИТ-директор: «10 недель — это впритык к весеннему пику отгрузок. Можем ли мы запустить приём заказов раньше, через 5 недель?»',
  },
  {
    id: 'sc-3',
    label: '«Боимся зависания рабочей 1С»',
    type: 'client_reply',
    text: 'ИТ-директор: «Если при синхронизации 5000 заказов наша рабочая 1С:УТ зависнет хотя бы на полчаса, склад встанет. Какие гарантии отказоустойчивости?»',
  },
  {
    id: 'sc-4',
    label: 'Идея ИП: «Поднять чек через SLA»',
    type: 'thought',
    text: 'Думаю предложить им выделенный стенд нагрузочного тестирования 1С и приоритетный мониторинг очередей в первые 60 дней запуска, чтобы поднять чек без риска для сроков.',
  },
];

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  session,
  directory,
  settings,
  onAddReplyAndAnalyze,
  onAcceptEdit,
  onRejectEdit,
  onDeferEdit,
  onNavigateToScreen,
}) => {
  const [replyType, setReplyType] = useState<MessageType>('client_reply');
  const [replyText, setReplyText] = useState('');
  const [activeSubView, setActiveSubView] = useState<'edits' | 'facts' | 'history'>('edits');
  const [editFilterStatus, setEditFilterStatus] = useState<EditStatus>('proposed');

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    session.messages[session.messages.length - 1]?.id ?? null
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [rejectingEditId, setRejectingEditId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  React.useEffect(() => {
    const lastMsg = session.messages[session.messages.length - 1];
    setSelectedMessageId(lastMsg ? lastMsg.id : null);
  }, [session.id, session.messages.length]);

  const totalPrice = calculateSessionTotalPrice(session.items);
  const feasibilityScore = calculateFeasibilityScore(session.items);
  const latestEvaluation = session.evaluations[session.evaluations.length - 1];
  const attractivenessScore = latestEvaluation ? latestEvaluation.attractivenessScore : 75;

  const activeMessage: BrainstormMessage | undefined =
    session.messages.find((m) => m.id === selectedMessageId) ||
    session.messages[session.messages.length - 1];

  const filteredEdits = session.edits.filter((e) => e.status === editFilterStatus);
  const proposedCount = session.edits.filter((e) => e.status === 'proposed').length;

  const runAnalysisPipeline = async (textToRun: string) => {
    if (!textToRun.trim()) return;
    setLlmError(null);
    setIsAnalyzing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await onAddReplyAndAnalyze(
        {
          text: textToRun.trim(),
          type: replyType,
        },
        controller.signal
      );
      setReplyText('');
      setEditFilterStatus('proposed');
      setActiveSubView('edits');
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        setLlmError(
          err instanceof Error
            ? err.message
            : 'Ошибка анализа. Введённый текст сохранён — нажмите «Повторить».'
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isAnalyzing) return;
    runAnalysisPipeline(replyText);
  };

  const handleConfirmReject = (editId: string) => {
    if (settings.requireRejectionReason && !rejectionReasonInput.trim()) {
      setRejectionError('Укажите короткую причину отказа.');
      return;
    }
    onRejectEdit(
      editId,
      rejectionReasonInput.trim() || 'Отклонено предпринимателем'
    );
    setRejectingEditId(null);
    setRejectionReasonInput('');
    setRejectionError('');
  };

  const getEditTypeLabel = (type: TkpEdit['type']) => {
    switch (type) {
      case 'price':
        return 'Цена';
      case 'deadline':
        return 'Сроки';
      case 'scope':
        return 'Объём работ';
      case 'payment_terms':
        return 'Оплата';
      case 'warranty':
        return 'Гарантии';
      case 'wording':
        return 'Формулировка';
    }
  };

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Переговоры · ${session.clientName}`}
        title="Рабочее место торга"
        subtitle="Введите возражение клиента или выберите быстрый сценарий — советник выделит факты и предложит точечные манёвры по ТКП."
        metrics={[
          {
            label: 'Текущая сумма ТКП',
            value: totalPrice,
            suffix: ' ₽',
            highlight: true,
          },
          {
            label: 'Реалистичность (ИП)',
            value: feasibilityScore,
            suffix: '%',
          },
          {
            label: 'Привлекательность',
            value: attractivenessScore,
            suffix: ' / 100',
          },
        ]}
        actions={
          <button
            onClick={() => onNavigateToScreen('context')}
            className="px-4 py-2 text-xs font-semibold rounded-xl theme-muted border transition-opacity hover:opacity-80 cursor-pointer whitespace-nowrap"
          >
            Вводные клиента
          </button>
        }
      />

      {/* Лаконичный блок ввода реплики и быстрых шаблонов */}
      <div className="rounded-3xl theme-surface border p-6 sm:p-7 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'client_reply', label: 'Возражение клиента' },
                { id: 'thought', label: 'Моя гипотеза' },
              ] as const
            ).map((tab) => {
              const active = replyType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReplyType(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    active ? 'theme-btn-primary shadow-xs' : 'theme-muted opacity-75 hover:opacity-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  setReplyType(sc.type);
                  setReplyText(sc.text);
                }}
                className="px-2.5 py-1 text-xs font-medium rounded-lg theme-muted hover:opacity-80 transition-opacity cursor-pointer"
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSendSubmit} className="flex flex-col sm:flex-row gap-3">
          <textarea
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={
              replyType === 'client_reply'
                ? 'Вставьте реплику клиента (например: «Просят скидку 200 тыс. ₽ или ускорение запуска»)...'
                : 'Опишите идею манёвра (например: «Предложить поэтапную оплату вместо скидки»)...'
            }
            className="flex-1 px-4 py-3 text-sm rounded-2xl theme-muted border focus:outline-none focus:ring-2 transition-all resize-none"
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={!replyText.trim() || isAnalyzing}
            className="px-6 py-3 text-xs font-bold rounded-2xl theme-btn-primary disabled:opacity-45 transition-all cursor-pointer inline-flex items-center justify-center gap-2 shrink-0"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Анализ...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Разобрать
              </>
            )}
          </motion.button>
        </form>

        {llmError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{llmError}</span>
            </div>
            <button
              type="button"
              onClick={() => runAnalysisPipeline(replyText)}
              className="inline-flex items-center gap-1 px-3 py-1 font-semibold text-white bg-red-600 rounded-lg cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Повторить
            </button>
          </div>
        )}
      </div>

      {/* Единый переключатель фокуса: на экране отображается ТОЛЬКО ОДИН смысловой блок без нагромождения */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            {(
              [
                {
                  id: 'edits',
                  label: `Рекомендованные манёвры (${proposedCount})`,
                },
                {
                  id: 'facts',
                  label: 'Суть позиции: Факты и Допущения',
                },
                {
                  id: 'history',
                  label: `История диалога (${session.messages.length})`,
                },
              ] as const
            ).map((tab) => {
              const active = activeSubView === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubView(tab.id)}
                  className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                    active
                      ? 'theme-btn-primary shadow-xs'
                      : 'theme-muted opacity-75 hover:opacity-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeSubView === 'edits' && (
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'proposed', label: 'Новые' },
                  { id: 'accepted', label: 'Принятые' },
                  { id: 'deferred', label: 'Отложенные' },
                  { id: 'rejected', label: 'Отказы' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  onClick={() => setEditFilterStatus(st.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    editFilterStatus === st.id
                      ? 'theme-accent-badge font-bold'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ВКЛАДКА 1: КАРТОЧКИ ПРАВОК ТКП */}
          {activeSubView === 'edits' && (
            <motion.div
              key="sub-edits"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              {filteredEdits.length === 0 ? (
                <div className="md:col-span-2 rounded-3xl theme-surface border p-10 text-center space-y-2">
                  <Sparkles className="w-6 h-6 mx-auto theme-accent-text" />
                  <div className="text-sm font-bold">В этой категории пока нет карточек</div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Отправьте реплику клиента выше или переключите фильтр статуса справа.
                  </p>
                </div>
              ) : (
                filteredEdits.map((edit, idx) => {
                  const linkedItem = session.items.find((i) => i.id === edit.linkedTkpItemId);
                  return (
                    <motion.div
                      key={edit.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="rounded-3xl theme-surface border p-6 flex flex-col justify-between gap-4 shadow-xs"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold theme-accent-text">
                            {getEditTypeLabel(edit.type)}
                            {linkedItem ? ` · ${linkedItem.code}` : ''}
                          </span>
                          <span className="font-mono tabular-nums font-bold">
                            {edit.priceDelta > 0
                              ? `+${edit.priceDelta.toLocaleString('ru-RU')} ₽`
                              : edit.priceDelta < 0
                              ? `${edit.priceDelta.toLocaleString('ru-RU')} ₽`
                              : '0 ₽ (сохранение маржи)'}
                          </span>
                        </div>

                        <h3 className="text-base font-bold leading-snug">{edit.title}</h3>

                        <div className="p-3.5 rounded-2xl theme-muted text-xs space-y-1.5">
                          <div style={{ color: 'var(--text-muted)' }}>
                            <strong>Было:</strong> {edit.currentValue}
                          </div>
                          <div>
                            <strong className="theme-accent-text">Предлагается:</strong>{' '}
                            {edit.proposedValue}
                          </div>
                        </div>

                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {edit.rationale}
                        </p>
                      </div>

                      {rejectingEditId === edit.id ? (
                        <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                          {rejectionError && (
                            <div className="text-xs text-red-500">{rejectionError}</div>
                          )}
                          <input
                            type="text"
                            value={rejectionReasonInput}
                            onChange={(e) => setRejectionReasonInput(e.target.value)}
                            placeholder="Причина отказа (чтобы не предлагать снова)..."
                            className="w-full px-3 py-2 text-xs rounded-xl theme-muted border"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setRejectingEditId(null)}
                              className="px-3 py-1.5 text-xs cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmReject(edit.id)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-xl cursor-pointer"
                            >
                              Подтвердить отказ
                            </button>
                          </div>
                        </div>
                      ) : (
                        (edit.status === 'proposed' || edit.status === 'deferred') && (
                          <div className="pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => onAcceptEdit(edit.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Принять в ТКП
                            </button>
                            {edit.status !== 'deferred' && (
                              <button
                                type="button"
                                onClick={() => onDeferEdit(edit.id)}
                                className="py-2 px-3 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingEditId(edit.id);
                                setRejectionReasonInput('');
                              }}
                              className="py-2 px-3 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 rounded-xl cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      )}
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* ВКЛАДКА 2: РАЗБОР ПОЗИЦИИ (ФАКТЫ И ДОПУЩЕНИЯ) */}
          {activeSubView === 'facts' && activeMessage?.analysis && (
            <motion.div
              key="sub-facts"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="rounded-3xl theme-surface border p-7 space-y-6"
            >
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider theme-accent-text">
                  Интерпретация реплики · Уверенность {activeMessage.analysis.confidence}%
                </div>
                <p className="text-sm sm:text-base font-medium leading-relaxed">
                  {activeMessage.analysis.interpretation}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-5 rounded-2xl bg-emerald-500/8 border border-emerald-500/25 space-y-3">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Подтверждённые факты (Fact)
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm leading-relaxed">
                    {activeMessage.analysis.statements
                      .filter((s) => s.kind === 'fact')
                      .map((s) => (
                        <li key={s.id}>• {s.text}</li>
                      ))}
                  </ul>
                </div>

                <div className="p-5 rounded-2xl bg-amber-500/8 border border-amber-500/25 space-y-3">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Гипотезы и допущения (Assumption)
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm leading-relaxed">
                    {activeMessage.analysis.statements
                      .filter((s) => s.kind === 'assumption')
                      .map((s) => (
                        <li key={s.id}>• {s.text}</li>
                      ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {/* ВКЛАДКА 3: ИСТОРИЯ РЕПЛИК */}
          {activeSubView === 'history' && (
            <motion.div
              key="sub-history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="space-y-3"
            >
              {session.messages.map((msg) => {
                const isSelected = activeMessage?.id === msg.id;
                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      setSelectedMessageId(msg.id);
                      setActiveSubView('facts');
                    }}
                    className={`p-5 rounded-2xl theme-surface border transition-all cursor-pointer ${
                      isSelected ? 'ring-2 ring-emerald-500/50' : 'hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold theme-accent-text">{msg.authorLabel}</span>
                      <span className="font-mono opacity-60">{msg.createdAt}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
