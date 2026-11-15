import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { MarketRecord, TradingSession } from '../types';
import {
  calculateFeasibilityScore,
  calculateSessionTotalPrice,
} from '../services/advisorEngine';
import {
  buildSessionHtmlReport,
  buildSessionMarkdownReport,
  downloadTextFile,
} from '../services/exportService';
import { TabHeroHeader } from './AnimatedText';

interface MetricsViewProps {
  session: TradingSession;
  directory: MarketRecord[];
}

export const MetricsView: React.FC<MetricsViewProps> = ({
  session,
  directory,
}) => {
  const [selectedCycleIdx, setSelectedCycleIdx] = useState<number>(
    Math.max(0, session.evaluations.length - 1)
  );

  React.useEffect(() => {
    setSelectedCycleIdx(Math.max(0, session.evaluations.length - 1));
  }, [session.id, session.evaluations.length]);

  const currentPrice = calculateSessionTotalPrice(session.items);
  const totalDelta = currentPrice - session.initialPrice;
  const feasibilityScore = calculateFeasibilityScore(session.items);
  const selectedEval =
    session.evaluations[selectedCycleIdx] ||
    session.evaluations[session.evaluations.length - 1];
  const attractivenessScore = selectedEval ? selectedEval.attractivenessScore : 75;

  const acceptedCount = session.edits.filter((e) => e.status === 'accepted').length;

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker={`Аналитика сделки · ${session.clientName}`}
        title="Итоги торга и выгрузка"
        subtitle="Отслеживайте динамику стоимости сделки по циклам торга и скачивайте чистовой документ коммерческого предложения."
        metrics={[
          {
            label: 'Итоговая стоимость ТКП',
            value: currentPrice,
            suffix: ' ₽',
            highlight: true,
          },
          {
            label: 'Прирост к старту',
            value: totalDelta,
            prefix: totalDelta >= 0 ? '+' : '',
            suffix: ' ₽',
          },
          {
            label: 'Принято манёвров',
            value: acceptedCount,
            suffix: ` из ${session.edits.length}`,
          },
          {
            label: 'Реалистичность',
            value: feasibilityScore,
            suffix: '%',
          },
        ]}
        actions={
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const md = buildSessionMarkdownReport(session, directory);
                downloadTextFile(`TKP_Report_${session.id}.md`, md, 'text/markdown;charset=utf-8');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4" />
              Отчёт (.md)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const html = buildSessionHtmlReport(session);
                downloadTextFile(`TKP_Printable_${session.id}.html`, html, 'text/html;charset=utf-8');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl theme-muted border cursor-pointer whitespace-nowrap"
            >
              <FileCode2 className="w-4 h-4" />
              Печать (.html)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                downloadTextFile(
                  `TKP_Session_${session.id}.json`,
                  JSON.stringify(session, null, 2),
                  'application/json;charset=utf-8'
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl theme-muted border cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              JSON
            </motion.button>
          </>
        }
      />

      {/* Интерактивный таймлайн-слайдер циклов + Факторы привлекательности */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-3xl theme-surface border p-6 sm:p-7 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 theme-accent-text" />
              <h2 className="text-base font-bold">
                Хронология циклов торга (Цикл {selectedCycleIdx + 1} из{' '}
                {session.evaluations.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedCycleIdx <= 0}
                onClick={() => setSelectedCycleIdx((i) => Math.max(0, i - 1))}
                className="p-1.5 rounded-xl theme-muted disabled:opacity-35 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, session.evaluations.length - 1)}
                value={selectedCycleIdx}
                onChange={(e) => setSelectedCycleIdx(Number(e.target.value))}
                className="w-36 cursor-pointer"
                style={{ accentColor: 'var(--accent-main)' }}
              />
              <button
                type="button"
                disabled={selectedCycleIdx >= session.evaluations.length - 1}
                onClick={() =>
                  setSelectedCycleIdx((i) =>
                    Math.min(session.evaluations.length - 1, i + 1)
                  )
                }
                className="p-1.5 rounded-xl theme-muted disabled:opacity-35 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedEval && (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedEval.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="p-5 rounded-2xl theme-muted space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-mono opacity-65">
                  <span>Цикл #{selectedEval.cycleNumber}</span>
                  <span>{selectedEval.timestamp}</span>
                </div>
                <div className="text-base font-bold">{selectedEval.label}</div>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {selectedEval.attractivenessRationale}
                </p>
                <div className="pt-3 flex flex-wrap items-center gap-8 font-mono tabular-nums text-sm font-bold">
                  <span className="theme-accent-text">
                    {selectedEval.totalPrice.toLocaleString('ru-RU')} ₽
                  </span>
                  <span>Реалистичность: {selectedEval.feasibilityScore}%</span>
                  <span>Оценка ЛПР: {selectedEval.attractivenessScore}/100</span>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          <div className="space-y-2">
            {session.evaluations.map((ev, idx) => (
              <div
                key={ev.id}
                onClick={() => setSelectedCycleIdx(idx)}
                className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                  selectedCycleIdx === idx ? 'theme-accent-badge font-bold' : 'theme-surface opacity-75 hover:opacity-100'
                }`}
              >
                <span>
                  {idx + 1}. {ev.label}
                </span>
                <span className="font-mono tabular-nums">
                  {ev.totalPrice.toLocaleString('ru-RU')} ₽ · {ev.attractivenessScore} б.
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Правая карточка: Факторы привлекательности */}
        <div className="lg:col-span-5 rounded-3xl theme-surface border p-6 sm:p-7 space-y-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Факторы оценки ЛПР</h2>
            <span className="text-lg font-mono font-extrabold theme-accent-text">
              {attractivenessScore} / 100
            </span>
          </div>

          <div className="space-y-4">
            {(selectedEval?.factors || []).map((factor, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{factor.name}</span>
                  <span className="font-mono tabular-nums">{factor.score} / 100</span>
                </div>
                <div className="w-full h-2 rounded-full theme-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${factor.score}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--accent-main)' }}
                  />
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {factor.comment}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
