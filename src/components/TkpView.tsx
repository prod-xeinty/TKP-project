import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  HelpCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  FeasibilityStatus,
  MarketRecord,
  TkpItem,
  TradingSession,
} from '../types';
import {
  calculateFeasibilityScore,
  calculateSessionTotalPrice,
} from '../services/advisorEngine';
import {
  buildSessionHtmlReport,
  downloadTextFile,
} from '../services/exportService';
import { TabHeroHeader } from './AnimatedText';

interface TkpViewProps {
  session: TradingSession;
  directory: MarketRecord[];
  onUpdateItemFeasibility: (itemId: string, feasibility: FeasibilityStatus) => void;
  onUpdateItemCommentOrCost: (
    itemId: string,
    updates: Partial<Pick<TkpItem, 'title' | 'value' | 'cost' | 'durationDays' | 'comment'>>
  ) => void;
  onAddTkpItem: (item: Omit<TkpItem, 'id' | 'sessionId'>) => void;
  onDeleteTkpItem: (itemId: string) => void;
}

export const TkpView: React.FC<TkpViewProps> = ({
  session,
  onUpdateItemFeasibility,
  onUpdateItemCommentOrCost,
  onAddTkpItem,
  onDeleteTkpItem,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showRejectionsDrawer, setShowRejectionsDrawer] = useState(false);
  const [newCode, setNewCode] = useState(`П.${session.items.length + 1}`);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Дополнительные работы');
  const [newValue, setNewValue] = useState('');
  const [newCost, setNewCost] = useState(120000);
  const [newDays, setNewDays] = useState(5);

  const totalPrice = calculateSessionTotalPrice(session.items);
  const feasibilityScore = calculateFeasibilityScore(session.items);
  const totalDays = session.items
    .filter((i) => i.feasibility !== 'infeasible')
    .reduce((acc, i) => acc + i.durationDays, 0);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTkpItem({
      code: newCode.trim() || `П.${session.items.length + 1}`,
      title: newTitle.trim(),
      category: newCategory.trim() || 'Основные работы',
      value: newValue.trim() || 'Согласно техническому заданию',
      cost: Number(newCost) || 0,
      durationDays: Number(newDays) || 1,
      feasibility: 'feasible',
      comment: '',
    });
    setNewTitle('');
    setNewValue('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Смета и чек-лист · ${session.clientName}`}
        title="Состав ТКП и реалистичность"
        subtitle="Управляйте стоимостью этапов и отмечайте выполнимость каждого пункта: невыполнимые обещания автоматически исключаются из расчёта."
        metrics={[
          {
            label: 'Итоговая сумма ТКП',
            value: totalPrice,
            suffix: ' ₽',
            highlight: true,
          },
          {
            label: 'Индекс реалистичности',
            value: feasibilityScore,
            suffix: '%',
          },
          {
            label: 'Трудоёмкость этапов',
            value: totalDays,
            suffix: ' дн.',
          },
        ]}
        actions={
          <>
            <button
              onClick={() => {
                const html = buildSessionHtmlReport(session);
                downloadTextFile(`TKP_${session.id}.html`, html, 'text/html;charset=utf-8');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl theme-muted border transition-opacity hover:opacity-80 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Печатная смета (.html)
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setNewCode(`П.${session.items.length + 1}`);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary transition-opacity cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Добавить этап
            </motion.button>
          </>
        }
      />

      {/* Просторный список этапов ТКП без лишних колонок */}
      <div className="space-y-3.5">
        {session.items.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="rounded-3xl theme-surface border p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-xs"
          >
            <div className="min-w-0 flex-1 space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="font-mono font-bold px-2.5 py-0.5 rounded-lg theme-accent-badge">
                  {item.code}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{item.category}</span>
              </div>
              <h3 className="text-base font-bold">{item.title}</h3>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {item.value}
              </p>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-4">
              <div className="text-right">
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Срок (дн.)
                </div>
                <input
                  type="number"
                  min={0}
                  value={item.durationDays}
                  onChange={(e) =>
                    onUpdateItemCommentOrCost(item.id, {
                      durationDays: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-20 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs font-bold rounded-xl theme-muted border"
                />
              </div>

              <div className="text-right">
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Стоимость (₽)
                </div>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={item.cost}
                  onChange={(e) =>
                    onUpdateItemCommentOrCost(item.id, {
                      cost: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-32 px-3 py-1.5 text-right font-mono tabular-nums text-xs font-bold rounded-xl theme-muted border"
                />
              </div>

              <div>
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                  Выполнимость
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl theme-muted border">
                  <button
                    type="button"
                    onClick={() => onUpdateItemFeasibility(item.id, 'feasible')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      item.feasibility === 'feasible'
                        ? 'bg-emerald-600 text-white'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Да
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateItemFeasibility(item.id, 'questionable')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      item.feasibility === 'questionable'
                        ? 'bg-amber-600 text-white'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Риск
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateItemFeasibility(item.id, 'infeasible')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      item.feasibility === 'infeasible'
                        ? 'bg-red-600 text-white'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Нет
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDeleteTkpItem(item.id)}
                title="Удалить этап"
                className="p-2 opacity-50 hover:opacity-100 hover:text-red-500 rounded-xl cursor-pointer mt-4"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Сворачиваемый блок запретов */}
      <div className="rounded-3xl theme-surface border p-5">
        <button
          type="button"
          onClick={() => setShowRejectionsDrawer((v) => !v)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <span className="text-xs font-bold">
            Зафиксированные запреты и отклонённые уступки ({session.rejections.length})
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              showRejectionsDrawer ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence>
          {showRejectionsDrawer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-3 border-t space-y-2 overflow-hidden"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {session.rejections.length === 0 ? (
                <div className="text-xs opacity-60">Отклонённых правок пока нет.</div>
              ) : (
                session.rejections.map((rej) => (
                  <div
                    key={rej.id}
                    className="p-3 rounded-2xl theme-muted flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold">{rej.summary}</span> —{' '}
                      <span className="text-red-500">«{rej.reason}»</span>
                    </div>
                    <span className="font-mono opacity-60">{rej.createdAt}</span>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Модальное окно добавления этапа */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="rounded-3xl theme-surface border max-w-lg w-full p-6 shadow-xl"
            >
              <h3 className="text-lg font-bold">Новый этап ТКП</h3>
              <form onSubmit={handleCreateItem} className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Код</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1">Категория</label>
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Наименование этапа *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Результат работ</label>
                  <textarea
                    rows={2}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Стоимость (₽)</label>
                    <input
                      type="number"
                      step={10000}
                      value={newCost}
                      onChange={(e) => setNewCost(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Срок (дн.)</label>
                    <input
                      type="number"
                      value={newDays}
                      onChange={(e) => setNewDays(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
                  >
                    Добавить
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
