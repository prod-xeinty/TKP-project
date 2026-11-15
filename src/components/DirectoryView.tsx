import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AppSettings,
  MarketRecord,
  ReliabilityStatus,
} from '../types';
import { isMarketRecordStale } from '../services/advisorEngine';
import { TabHeroHeader } from './AnimatedText';

interface DirectoryViewProps {
  directory: MarketRecord[];
  settings: AppSettings;
  industryContext: string;
  onAddOrUpdateRecord: (record: MarketRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onRefreshMarketData: () => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  directory,
  settings,
  industryContext,
  onAddOrUpdateRecord,
  onDeleteRecord,
  onRefreshMarketData,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'fact' | 'assumption' | 'stale'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStepText, setRefreshStepText] = useState('');

  const [editingRecord, setEditingRecord] = useState<MarketRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [analogName, setAnalogName] = useState('');
  const [industry, setIndustry] = useState(industryContext || 'Логистика и дистрибуция');
  const [priceMin, setPriceMin] = useState(450000);
  const [priceMax, setPriceMax] = useState(750000);
  const [conditions, setConditions] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [fetchedAt, setFetchedAt] = useState('2026-11-13');
  const [reliability, setReliability] = useState<ReliabilityStatus>('fact');

  const openCreateModal = () => {
    setEditingRecord(null);
    setAnalogName('');
    setIndustry(industryContext || 'IT-разработка B2B');
    setPriceMin(400000);
    setPriceMax(650000);
    setConditions('Поэтапная оплата, гарантия 3 мес.');
    setSourceTitle('Мониторинг коммерческих предложений');
    setSourceUrl('https://');
    setFetchedAt('2026-11-13');
    setReliability('fact');
    setIsModalOpen(true);
  };

  const openEditModal = (rec: MarketRecord) => {
    setEditingRecord(rec);
    setAnalogName(rec.analogName);
    setIndustry(rec.industry);
    setPriceMin(rec.priceMin);
    setPriceMax(rec.priceMax);
    setConditions(rec.conditions);
    setSourceTitle(rec.sourceTitle);
    setSourceUrl(rec.sourceUrl);
    setFetchedAt(rec.fetchedAt);
    setReliability(rec.reliability);
    setIsModalOpen(true);
  };

  const handleSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!analogName.trim()) return;
    const record: MarketRecord = {
      id: editingRecord ? editingRecord.id : `dir-${Date.now()}`,
      analogName: analogName.trim(),
      industry: industry.trim() || 'B2B',
      priceMin: Number(priceMin) || 0,
      priceMax: Number(priceMax) || Number(priceMin) || 0,
      conditions: conditions.trim(),
      sourceTitle: sourceTitle.trim() || 'Локальный источник',
      sourceUrl: sourceUrl.trim() || 'https://',
      fetchedAt: fetchedAt || '2026-11-13',
      reliability,
      isManual: true,
      comment: '',
    };
    onAddOrUpdateRecord(record);
    setIsModalOpen(false);
  };

  const handleRunMarketUpdate = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshStepText(`Сбор актуальных прайс-листов по сегменту «${industryContext}»...`);

    setTimeout(() => {
      onRefreshMarketData();
      setIsRefreshing(false);
      setRefreshStepText('');
    }, 1100);
  };

  const filteredDirectory = directory.filter((rec) => {
    const stale = isMarketRecordStale(rec.fetchedAt, settings.staleThresholdDays);
    if (filterMode === 'fact' && rec.reliability !== 'fact') return false;
    if (filterMode === 'assumption' && rec.reliability !== 'assumption') return false;
    if (filterMode === 'stale' && !stale) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      rec.analogName.toLowerCase().includes(q) ||
      rec.industry.toLowerCase().includes(q) ||
      rec.sourceTitle.toLowerCase().includes(q)
    );
  });

  const factCount = directory.filter((r) => r.reliability === 'fact').length;
  const staleCount = directory.filter((r) =>
    isMarketRecordStale(r.fetchedAt, settings.staleThresholdDays)
  ).length;

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Рыночные ориентиры · ${industryContext}`}
        title="Аналоги рынка и база фактов"
        subtitle="Сравнивайте своё предложение с реальными расценками конкурентов: твёрдые факты отделены от экспертных оценок."
        metrics={[
          {
            label: 'Всего ориентиров',
            value: directory.length,
            highlight: true,
          },
          {
            label: 'Подтверждённые факты',
            value: factCount,
          },
          {
            label: 'Устаревшие (stale)',
            value: staleCount,
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={handleRunMarketUpdate}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl theme-muted border transition-opacity hover:opacity-80 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin theme-accent-text" />
              ) : (
                <RefreshCw className="w-4 h-4 theme-accent-text" />
              )}
              Обновить рынок
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary transition-opacity cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Добавить аналог
            </button>
          </>
        }
      />

      {isRefreshing && (
        <div className="p-4 rounded-2xl theme-accent-badge flex items-center gap-3 text-xs font-semibold">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{refreshStepText}</span>
        </div>
      )}

      {/* Чистая строка фильтра и поиска */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `Все (${directory.length})` },
              { id: 'fact', label: `Факты (${factCount})` },
              {
                id: 'assumption',
                label: `Оценки (${directory.length - factCount})`,
              },
              { id: 'stale', label: `Устаревшие (${staleCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                filterMode === tab.id
                  ? 'theme-btn-primary'
                  : 'theme-muted opacity-75 hover:opacity-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 opacity-45 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по услуге или источнику..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl theme-surface border focus:outline-none"
          />
        </div>
      </div>

      {/* Сетка карточек аналогов вместо громоздкой таблицы */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredDirectory.map((rec, idx) => {
          const isStale = isMarketRecordStale(rec.fetchedAt, settings.staleThresholdDays);
          return (
            <motion.div
              key={rec.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="rounded-3xl theme-surface border p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold">
                    {rec.reliability === 'fact' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span
                      className={
                        rec.reliability === 'fact'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {rec.reliability === 'fact' ? 'Факт (fact)' : 'Оценка (assumption)'}
                    </span>
                    {isStale && <span className="text-red-500 ml-1">· Stale</span>}
                  </span>

                  <span className="font-mono text-[11px] opacity-60">{rec.fetchedAt}</span>
                </div>

                <h3 className="text-base font-bold leading-snug">{rec.analogName}</h3>

                <div className="text-xl font-extrabold font-mono tabular-nums theme-accent-text">
                  {rec.priceMin.toLocaleString('ru-RU')} – {rec.priceMax.toLocaleString('ru-RU')} ₽
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {rec.conditions}
                </p>
              </div>

              <div className="pt-3 border-t flex items-center justify-between gap-2 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="truncate opacity-75">
                  {rec.sourceTitle}
                  {rec.sourceUrl && rec.sourceUrl.startsWith('http') && (
                    <a
                      href={rec.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 ml-2 theme-accent-text hover:underline"
                    >
                      Источник <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(rec)}
                    className="p-1.5 rounded-lg theme-muted hover:opacity-80 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(rec.id)}
                    className="p-1.5 rounded-lg theme-muted hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Модальное окно */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="rounded-3xl theme-surface border max-w-lg w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold">
              {editingRecord ? 'Редактирование аналога' : 'Новый рыночный аналог'}
            </h3>
            <form onSubmit={handleSaveRecord} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Наименование услуги *</label>
                <input
                  type="text"
                  required
                  value={analogName}
                  onChange={(e) => setAnalogName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Отрасль</label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Достоверность</label>
                  <select
                    value={reliability}
                    onChange={(e) => setReliability(e.target.value as ReliabilityStatus)}
                    className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                  >
                    <option value="fact">fact (подтверждено)</option>
                    <option value="assumption">assumption (оценка)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Цена МИН (₽)</label>
                  <input
                    type="number"
                    step={10000}
                    value={priceMin}
                    onChange={(e) => setPriceMin(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Цена МАКС (₽)</label>
                  <input
                    type="number"
                    step={10000}
                    value={priceMax}
                    onChange={(e) => setPriceMax(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl theme-muted border"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Условия</label>
                <input
                  type="text"
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl theme-muted border"
                />
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
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
