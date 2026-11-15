import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Save,
  Sparkles,
} from 'lucide-react';
import { TradingContext, TradingSession } from '../types';
import { calculateSessionTotalPrice } from '../services/advisorEngine';
import { TabHeroHeader } from './AnimatedText';

interface ContextViewProps {
  session: TradingSession;
  onSaveContext: (updatedContext: TradingContext, updatedTitle: string, updatedClientName: string) => void;
  onStartWorkspace: () => void;
}

export const ContextView: React.FC<ContextViewProps> = ({
  session,
  onSaveContext,
  onStartWorkspace,
}) => {
  const [title, setTitle] = useState(session.title);
  const [clientName, setClientName] = useState(session.clientName);
  const [form, setForm] = useState<TradingContext>(session.context);
  const [savedBanner, setSavedBanner] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showExtendedContext, setShowExtendedContext] = useState(false);

  React.useEffect(() => {
    setTitle(session.title);
    setClientName(session.clientName);
    setForm(session.context);
    setValidationErrors([]);
  }, [session]);

  const validateRequiredFields = (): string[] => {
    const errs: string[] = [];
    if (!clientName.trim()) errs.push('Укажите наименование клиента');
    if (!form.industry.trim()) errs.push('Укажите отрасль клиента');
    if (!form.decisionMaker.trim()) errs.push('Укажите ЛПР и его мотивы');
    if (form.budgetMax <= 0 || form.budgetMin <= 0 || form.budgetMax < form.budgetMin) {
      errs.push('Проверьте диапазон бюджета');
    }
    if (!form.deadlines.trim()) errs.push('Укажите целевые сроки');
    if (!form.clientTasks.trim()) errs.push('Заполните задачи клиента');
    if (!form.clientProblems.trim()) errs.push('Заполните проблемы клиента');
    return errs;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateRequiredFields();
    setValidationErrors(errs);
    if (errs.length > 0) return;

    onSaveContext(form, title.trim() || session.title, clientName.trim() || session.clientName);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleValidateAndGoToTrading = () => {
    const errs = validateRequiredFields();
    setValidationErrors(errs);
    if (errs.length > 0) return;

    onSaveContext(form, title.trim() || session.title, clientName.trim() || session.clientName);
    onStartWorkspace();
  };

  const handleGenerateClarifyingQuestions = () => {
    setForm((prev) => ({
      ...prev,
      clarifyingQuestions: [
        'Кто инициировал контакт со стороны клиента и есть ли внутренний чемпион?',
        `Разброс бюджета составляет ${(form.budgetMax - form.budgetMin).toLocaleString('ru-RU')} ₽: привязана ли верхняя планка к запуску в этом квартале?`,
        'Какие прямые убытки несёт клиент за каждый месяц откладывания проекта?',
      ],
    }));
  };

  const currentPrice = calculateSessionTotalPrice(session.items);

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Паспорт сделки · ${clientName || session.clientName}`}
        title="Вводные клиента и бюджет"
        subtitle="Ключевые параметры заказчика, бюджетный коридор и задачи проекта."
        metrics={[
          {
            label: 'Бюджет МИН',
            value: form.budgetMin,
            suffix: ' ₽',
          },
          {
            label: 'Бюджет МАКС',
            value: form.budgetMax,
            suffix: ' ₽',
            highlight: true,
          },
          {
            label: 'Текущее ТКП',
            value: currentPrice,
            suffix: ' ₽',
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl theme-muted border cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Сохранить
            </button>
            <button
              type="button"
              onClick={handleValidateAndGoToTrading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
            >
              К торгу
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        }
      />

      {savedBanner && (
        <div className="flex items-center gap-2 p-3.5 text-xs font-semibold rounded-2xl theme-accent-badge">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Контекст сессии успешно сохранён.
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl space-y-1 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Проверьте поля:
          </div>
          <ul className="list-disc list-inside">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-3xl theme-surface border p-6 sm:p-8 space-y-5 shadow-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Название проекта / ТКП *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Клиент (организация) *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Отрасль *</label>
            <input
              type="text"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">ЛПР и приоритеты *</label>
            <input
              type="text"
              value={form.decisionMaker}
              onChange={(e) => setForm({ ...form, decisionMaker: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Бюджет МИН (₽) *</label>
            <input
              type="number"
              step={50000}
              value={form.budgetMin}
              onChange={(e) => setForm({ ...form, budgetMin: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl theme-muted border"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Бюджет МАКС (₽) *</label>
            <input
              type="number"
              step={50000}
              value={form.budgetMax}
              onChange={(e) => setForm({ ...form, budgetMax: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl theme-muted border"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">Прогретость</label>
              <span className="text-xs font-mono font-bold theme-accent-text">
                {form.warmthScale} / 10
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={form.warmthScale}
              onChange={(e) => setForm({ ...form, warmthScale: Number(e.target.value) })}
              className="w-full cursor-pointer mt-2"
              style={{ accentColor: 'var(--accent-main)' }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">Целевые сроки *</label>
          <input
            type="text"
            value={form.deadlines}
            onChange={(e) => setForm({ ...form, deadlines: e.target.value })}
            className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Задачи клиента *</label>
            <textarea
              rows={3}
              value={form.clientTasks}
              onChange={(e) => setForm({ ...form, clientTasks: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Боли и цена бездействия *</label>
            <textarea
              rows={3}
              value={form.clientProblems}
              onChange={(e) => setForm({ ...form, clientProblems: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl theme-muted border"
            />
          </div>
        </div>

        {/* Сворачиваемое досье и уточняющие вопросы */}
        <div className="pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => setShowExtendedContext((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-bold theme-accent-text cursor-pointer"
          >
            {showExtendedContext ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Скрыть дополнительные поля и уточняющие вопросы
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Показать дополнительные поля и вопросы для разведки ({form.clarifyingQuestions.length})
              </>
            )}
          </button>

          <AnimatePresence>
            {showExtendedContext && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden pt-4 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">История касаний</label>
                    <textarea
                      rows={2}
                      value={form.relationshipHistory}
                      onChange={(e) => setForm({ ...form, relationshipHistory: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Укрупнённые этапы</label>
                    <textarea
                      rows={2}
                      value={form.taskDecomposition}
                      onChange={(e) => setForm({ ...form, taskDecomposition: e.target.value })}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl theme-muted space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 theme-accent-text" />
                      Уточняющие вопросы клиенту
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateClarifyingQuestions}
                      className="inline-flex items-center gap-1 text-xs font-bold theme-accent-text cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Обновить
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {form.clarifyingQuestions.map((q, i) => (
                      <li key={i}>
                        <strong>В.{i + 1}:</strong> {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>
    </div>
  );
};
