import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  FolderOpen,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { SessionStatus, TradingSession } from '../types';
import {
  calculateFeasibilityScore,
  calculateSessionTotalPrice,
} from '../services/advisorEngine';
import { TabHeroHeader } from './AnimatedText';

interface SessionsViewProps {
  sessions: TradingSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string, openWorkspace?: boolean) => void;
  onCreateSession: (payload: {
    title: string;
    clientName: string;
    industry: string;
    decisionMaker: string;
    budgetMin: number;
    budgetMax: number;
    initialPrice: number;
  }) => void;
  onToggleArchiveSession: (sessionId: string) => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onToggleArchiveSession,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | SessionStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newIndustry, setNewIndustry] = useState('IT-разработка и интеграция (B2B)');
  const [newDecisionMaker, setNewDecisionMaker] = useState('Коммерческий директор');
  const [newBudgetMin, setNewBudgetMin] = useState(900000);
  const [newBudgetMax, setNewBudgetMax] = useState(1400000);
  const [newInitialPrice, setNewInitialPrice] = useState(1150000);

  const filteredSessions = sessions.filter((s) =>
    statusFilter === 'all' ? true : s.status === statusFilter
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClient.trim()) return;
    onCreateSession({
      title: newTitle.trim(),
      clientName: newClient.trim(),
      industry: newIndustry.trim() || 'B2B',
      decisionMaker: newDecisionMaker.trim() || 'ЛПР',
      budgetMin: Number(newBudgetMin) || 500000,
      budgetMax: Number(newBudgetMax) || 1000000,
      initialPrice: Number(newInitialPrice) || 750000,
    });
    setNewTitle('');
    setNewClient('');
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Реестр сделок · Всего: ${sessions.length}`}
        title="Сделки и сессии переговоров"
        subtitle="Переключайтесь между коммерческими предложениями или создавайте новую сделку."
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Новая сделка
          </button>
        }
      />

      <div className="flex items-center gap-2">
        {(
          [
            { id: 'all', label: `Все (${sessions.length})` },
            { id: 'active', label: 'Активные' },
            { id: 'draft', label: 'Черновики' },
            { id: 'archived', label: 'Архив' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              statusFilter === tab.id ? 'theme-btn-primary' : 'theme-muted opacity-75 hover:opacity-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredSessions.map((session, idx) => {
          const total = calculateSessionTotalPrice(session.items);
          const feasibility = calculateFeasibilityScore(session.items);
          const isCurrent = session.id === activeSessionId;

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`rounded-3xl theme-surface border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xs ${
                isCurrent ? 'ring-2 ring-emerald-500/40' : ''
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold theme-accent-text">{session.clientName}</span>
                  <span>·</span>
                  <span style={{ color: 'var(--text-muted)' }}>{session.context.industry}</span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md theme-accent-badge">
                      Активна
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold">{session.title}</h3>
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Сумма ТКП: <strong>{total.toLocaleString('ru-RU')} ₽</strong> · Реалистичность:{' '}
                  <strong>{feasibility}%</strong> · Правок: {session.edits.length}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onSelectSession(session.id, true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Открыть торг
                </button>
                <button
                  onClick={() => onSelectSession(session.id, false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
                >
                  Вводные
                </button>
                <button
                  onClick={() => onToggleArchiveSession(session.id)}
                  className="p-2 rounded-xl theme-muted cursor-pointer"
                  title="В архив / Из архива"
                >
                  {session.status === 'archived' ? (
                    <RotateCcw className="w-4 h-4" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {isModalOpen && (
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
              <h2 className="text-lg font-bold">Новая сделка</h2>
              <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Предмет ТКП *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Разработка B2B-портала и обмен с 1С"
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Клиент *</label>
                  <input
                    type="text"
                    required
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="ООО «Вектор Логистик»"
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Бюджет МИН</label>
                    <input
                      type="number"
                      step={50000}
                      value={newBudgetMin}
                      onChange={(e) => setNewBudgetMin(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Бюджет МАКС</label>
                    <input
                      type="number"
                      step={50000}
                      value={newBudgetMax}
                      onChange={(e) => setNewBudgetMax(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Старт ТКП</label>
                    <input
                      type="number"
                      step={50000}
                      value={newInitialPrice}
                      onChange={(e) => setNewInitialPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
                  >
                    Создать
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
