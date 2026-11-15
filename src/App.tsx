import React, { useEffect, useState } from 'react';
import {
  AnimatePresence,
  motion,
} from 'motion/react';
import {
  BarChart3,
  BookMarked,
  Briefcase,
  CheckSquare,
  ChevronDown,
  Download,
  FolderKanban,
  MessageSquareCode,
  Settings,
} from 'lucide-react';
import {
  AppDatabase,
  AppScreen,
  AppSettings,
  FeasibilityStatus,
  MarketRecord,
  MessageType,
  TkpItem,
  TradingContext,
  TradingSession,
} from './types';
import { INITIAL_DATABASE } from './data/initialData';
import {
  createEvaluationSnapshotAfterEdit,
  generateReplyAnalysisAndEdits,
  calculateSessionTotalPrice,
} from './services/advisorEngine';
import {
  buildSessionMarkdownReport,
  downloadTextFile,
} from './services/exportService';
import { SessionsView } from './components/SessionsView';
import { ContextView } from './components/ContextView';
import { WorkspaceView } from './components/WorkspaceView';
import { TkpView } from './components/TkpView';
import { DirectoryView } from './components/DirectoryView';
import { MetricsView } from './components/MetricsView';
import { SettingsView } from './components/SettingsView';
import { IS_STATIC_HOSTING, SOURCE_DOWNLOAD_URL } from './services/runtime';

const STORAGE_KEY = 'tkp_advisor_db_v1';
const THEME_STORAGE_KEY = 'tkp_advisor_theme';
const PALETTE_STORAGE_KEY = 'tkp_advisor_palette';

type PaletteId = 'emerald' | 'copper' | 'violet';

export default function App() {
  const [database, setDatabase] = useState<AppDatabase>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppDatabase;
        if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_DATABASE;
  });

  const [activeScreen, setActiveScreen] = useState<AppScreen>('workspace');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [palette] = useState<PaletteId>(() => {
    try {
      const saved = localStorage.getItem(PALETTE_STORAGE_KEY) as PaletteId;
      if (saved === 'emerald' || saved === 'copper' || saved === 'violet') {
        return saved;
      }
    } catch {
      // Fallback
    }
    return 'emerald';
  });

  useEffect(() => {
    if (IS_STATIC_HOSTING) return;
    fetch('/api/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((serverDb: AppDatabase | null) => {
        if (serverDb && Array.isArray(serverDb.sessions) && serverDb.sessions.length > 0) {
          setDatabase(serverDb);
        }
      })
      .catch(() => {
        // Fallback to localStorage
      });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, palette);
    } catch {
      // Ignore
    }
  }, [palette]);

  const persistDatabase = (nextDb: AppDatabase) => {
    setDatabase(nextDb);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDb));
    } catch {
      // Ignore
    }
    if (IS_STATIC_HOSTING) return;
    fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextDb),
    }).catch(() => {
      // Ignore
    });
  };

  const activeSession: TradingSession =
    database.sessions.find((s) => s.id === database.activeSessionId) ||
    database.sessions[0];

  const updateSessionById = (
    sessionId: string,
    updater: (session: TradingSession) => TradingSession
  ) => {
    const nextDb: AppDatabase = {
      ...database,
      sessions: database.sessions.map((s) => (s.id === sessionId ? updater(s) : s)),
    };
    persistDatabase(nextDb);
  };

  const handleCreateSession = (payload: {
    title: string;
    clientName: string;
    industry: string;
    decisionMaker: string;
    budgetMin: number;
    budgetMax: number;
    initialPrice: number;
  }) => {
    const newId = `ses-${Date.now()}`;
    const nowIso = new Date().toISOString().slice(0, 19);
    const nowReadable = nowIso.slice(0, 16).replace('T', ' ');

    const newSession: TradingSession = {
      id: newId,
      title: payload.title,
      clientName: payload.clientName,
      status: 'draft',
      initialPrice: payload.initialPrice,
      createdAt: nowIso,
      updatedAt: nowIso,
      context: {
        sessionId: newId,
        clientDescription: `Заказчик в сегменте «${payload.industry}».`,
        industry: payload.industry,
        decisionMaker: payload.decisionMaker,
        relationshipHistory: 'Первичный брифинг проведён, готовим коммерческое предложение.',
        budgetMin: payload.budgetMin,
        budgetMax: payload.budgetMax,
        deadlines: '8–10 недель с момента подписания.',
        clientTasks: 'Автоматизация ключевого бизнес-процесса и интеграция с учётным контуром.',
        clientProblems: 'Потери времени на ручных операциях и отсутствие прозрачного контроля.',
        warmthScale: 7,
        tkpDraft: 'Поэтапная реализация проекта: проектирование, разработка ядра, интеграция и запуск.',
        taskDecomposition: '1. Аналитика и ТЗ\n2. Основная разработка\n3. Интеграция и тестирование\n4. Обучение и запуск',
        clarifyingQuestions: [
          'Какие критерии успешного запуска являются ключевыми для ЛПР?',
          'С какими предложениями конкурентов клиент будет сравнивать наше ТКП?',
        ],
      },
      items: [
        {
          id: `item-${Date.now()}-1`,
          sessionId: newId,
          code: 'П.1',
          title: 'Предпроектное обследование и техническое проектирование',
          category: 'Аналитика',
          value: 'Архитектура решения, спецификация интеграции и макеты интерфейсов',
          cost: Math.round(payload.initialPrice * 0.2),
          durationDays: 10,
          feasibility: 'feasible',
          comment: 'Выполнимо силами ИП.',
        },
        {
          id: `item-${Date.now()}-2`,
          sessionId: newId,
          code: 'П.2',
          title: 'Разработка основного программного модуля и бизнес-логики',
          category: 'Разработка',
          value: 'Реализация клиентского и серверного функционала по ТЗ',
          cost: Math.round(payload.initialPrice * 0.55),
          durationDays: 25,
          feasibility: 'feasible',
          comment: 'Базовый стек отработан.',
        },
        {
          id: `item-${Date.now()}-3`,
          sessionId: newId,
          code: 'П.3',
          title: 'Интеграция, приёмо-сдаточные испытания и гарантийная поддержка',
          category: 'Внедрение',
          value: 'Настройка обмена данными, обучение сотрудников и гарантия 2 месяца',
          cost:
            payload.initialPrice -
            Math.round(payload.initialPrice * 0.2) -
            Math.round(payload.initialPrice * 0.55),
          durationDays: 10,
          feasibility: 'feasible',
          comment: 'Полностью реалистично.',
        },
      ],
      messages: [],
      edits: [],
      rejections: [],
      evaluations: [
        {
          id: `eval-${Date.now()}`,
          sessionId: newId,
          cycleNumber: 1,
          label: 'Стартовое формирование сессии',
          timestamp: nowReadable,
          totalPrice: payload.initialPrice,
          feasibilityScore: 100,
          attractivenessScore: 72,
          attractivenessRationale:
            'Базовая комплектация сформирована в рамках бюджета клиента.',
          factors: [
            { name: 'Цена относительно рынка', score: 75, comment: 'В пределах ожидания клиента.' },
            { name: 'Срок реализации', score: 78, comment: 'Стандартный производственный цикл.' },
            { name: 'Гарантии и SLA', score: 65, comment: 'Можно усилить для роста стоимости.' },
            { name: 'Этапность оплаты', score: 70, comment: 'Базовые условия оплаты.' },
          ],
        },
      ],
    };

    persistDatabase({
      ...database,
      activeSessionId: newId,
      sessions: [newSession, ...database.sessions],
    });
    setActiveScreen('context');
  };

  const handleToggleArchiveSession = (sessionId: string) => {
    updateSessionById(sessionId, (s) => ({
      ...s,
      status: s.status === 'archived' ? 'active' : 'archived',
      updatedAt: new Date().toISOString().slice(0, 19),
    }));
  };

  const handleSaveContext = (
    updatedContext: TradingContext,
    updatedTitle: string,
    updatedClientName: string
  ) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      title: updatedTitle,
      clientName: updatedClientName,
      status: s.status === 'draft' ? 'active' : s.status,
      updatedAt: new Date().toISOString().slice(0, 19),
      context: updatedContext,
    }));
  };

  const handleAddReplyAndAnalyze = async (
    payload: {
      text: string;
      type: MessageType;
      linkedTkpItemId?: string;
    },
    signal?: AbortSignal
  ) => {
    if (!IS_STATIC_HOSTING) {
      const res = await fetch(`/api/sessions/${activeSession.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (res.ok) {
        const updatedDb = (await res.json()) as AppDatabase;
        setDatabase(updatedDb);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDb));
        } catch {
          // Ignore
        }
        return;
      }
    }

    updateSessionById(activeSession.id, (s) => {
      const { message, newEdits } = generateReplyAnalysisAndEdits({
        session: s,
        messageText: payload.text,
        messageType: payload.type,
        linkedTkpItemId: payload.linkedTkpItemId,
        directory: database.directory,
      });

      return {
        ...s,
        status: 'active',
        updatedAt: new Date().toISOString().slice(0, 19),
        messages: [...s.messages, message],
        edits: [...newEdits, ...s.edits],
      };
    });
  };

  const handleAcceptEdit = (editId: string) => {
    updateSessionById(activeSession.id, (s) => {
      const targetEdit = s.edits.find((e) => e.id === editId);
      if (!targetEdit || targetEdit.status === 'accepted') return s;

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const updatedItems = s.items.map((item) => {
        if (item.id === targetEdit.linkedTkpItemId) {
          return {
            ...item,
            value: targetEdit.proposedValue,
            cost: Math.max(0, item.cost + targetEdit.priceDelta),
            feasibility:
              item.feasibility === 'questionable' && targetEdit.type === 'wording'
                ? ('feasible' as FeasibilityStatus)
                : item.feasibility,
          };
        }
        return item;
      });

      const hasLinkedMatch = s.items.some((i) => i.id === targetEdit.linkedTkpItemId);
      if (!hasLinkedMatch && targetEdit.priceDelta !== 0 && updatedItems.length > 0) {
        updatedItems[0] = {
          ...updatedItems[0],
          cost: Math.max(0, updatedItems[0].cost + targetEdit.priceDelta),
        };
      }

      const updatedEdits = s.edits.map((e) =>
        e.id === editId ? { ...e, status: 'accepted' as const, decidedAt: nowStr } : e
      );

      const newSnapshot = createEvaluationSnapshotAfterEdit(s, targetEdit, updatedItems);

      return {
        ...s,
        updatedAt: new Date().toISOString().slice(0, 19),
        items: updatedItems,
        edits: updatedEdits,
        evaluations: [...s.evaluations, newSnapshot],
      };
    });
  };

  const handleRejectEdit = (editId: string, reason: string) => {
    updateSessionById(activeSession.id, (s) => {
      const targetEdit = s.edits.find((e) => e.id === editId);
      if (!targetEdit || targetEdit.status === 'rejected') return s;

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const updatedEdits = s.edits.map((e) =>
        e.id === editId
          ? {
              ...e,
              status: 'rejected' as const,
              rejectionReason: reason,
              decidedAt: nowStr,
            }
          : e
      );

      const rejectionRecord = {
        id: `rej-${Date.now()}`,
        editId,
        sessionId: s.id,
        editType: targetEdit.type,
        summary: `${targetEdit.title} (${targetEdit.proposedValue})`,
        reason,
        contextSnapshot: `Сумма ТКП: ${calculateSessionTotalPrice(s.items).toLocaleString('ru-RU')} ₽`,
        createdAt: nowStr,
      };

      return {
        ...s,
        updatedAt: new Date().toISOString().slice(0, 19),
        edits: updatedEdits,
        rejections: [...s.rejections, rejectionRecord],
      };
    });
  };

  const handleDeferEdit = (editId: string) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      edits: s.edits.map((e) =>
        e.id === editId ? { ...e, status: 'deferred' as const } : e
      ),
    }));
  };

  const handleUpdateItemFeasibility = (itemId: string, feasibility: FeasibilityStatus) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? { ...i, feasibility } : i)),
    }));
  };

  const handleUpdateItemCommentOrCost = (
    itemId: string,
    updates: Partial<Pick<TkpItem, 'title' | 'value' | 'cost' | 'durationDays' | 'comment'>>
  ) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
    }));
  };

  const handleAddTkpItem = (newItem: Omit<TkpItem, 'id' | 'sessionId'>) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      items: [
        ...s.items,
        {
          ...newItem,
          id: `item-${Date.now()}`,
          sessionId: s.id,
        },
      ],
    }));
  };

  const handleDeleteTkpItem = (itemId: string) => {
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      items: s.items.filter((i) => i.id !== itemId),
    }));
  };

  const handleAddOrUpdateRecord = (record: MarketRecord) => {
    const exists = database.directory.some((r) => r.id === record.id);
    persistDatabase({
      ...database,
      directory: exists
        ? database.directory.map((r) => (r.id === record.id ? record : r))
        : [record, ...database.directory],
    });
  };

  const handleDeleteRecord = (recordId: string) => {
    persistDatabase({
      ...database,
      directory: database.directory.filter((r) => r.id !== recordId),
    });
  };

  const handleRefreshMarketData = () => {
    if (IS_STATIC_HOSTING) return;
    fetch('/api/directory/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry: activeSession.context.industry }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((updatedDb: AppDatabase | null) => {
        if (updatedDb) {
          setDatabase(updatedDb);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDb));
        }
      })
      .catch(() => {
        // Ignore
      });
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    persistDatabase({
      ...database,
      settings: newSettings,
    });
  };

  const handleQuickExportMarkdown = () => {
    const md = buildSessionMarkdownReport(activeSession, database.directory);
    downloadTextFile(`TKP_${activeSession.id}.md`, md, 'text/markdown;charset=utf-8');
  };

  const primaryTabs: { id: AppScreen; label: string; icon: React.ReactNode }[] = [
    {
      id: 'workspace',
      label: 'Торг',
      icon: <MessageSquareCode className="w-4 h-4" />,
    },
    {
      id: 'tkp',
      label: 'Смета ТКП',
      icon: <CheckSquare className="w-4 h-4" />,
    },
    {
      id: 'directory',
      label: 'Аналоги',
      icon: <BookMarked className="w-4 h-4" />,
    },
    {
      id: 'metrics',
      label: 'Итоги',
      icon: <BarChart3 className="w-4 h-4" />,
    },
  ];

  const secondaryTabs: { id: AppScreen; label: string; icon: React.ReactNode }[] = [
    {
      id: 'context',
      label: 'Вводные клиента',
      icon: <Briefcase className="w-4 h-4" />,
    },
    {
      id: 'sessions',
      label: 'Все сделки',
      icon: <FolderKanban className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: 'Настройки и архив',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Единая воздушная верхняя панель без бокового меню (3 зоны) */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md transition-colors"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 86%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="w-full px-4 sm:px-8 py-3 grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
          {/* Зона 1: Бренд + компактный выбор активной сделки */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setActiveScreen('workspace')}
              className="shrink-0 text-base sm:text-lg font-extrabold tracking-tight cursor-pointer"
            >
              ТКП<span className="theme-accent-text">·Советник</span>
            </button>

            <select
              aria-label="Активная сделка"
              value={activeSession.id}
              onChange={(e) =>
                persistDatabase({
                  ...database,
                  activeSessionId: e.target.value,
                })
              }
              className="hidden xl:block min-w-0 max-w-48 truncate px-2.5 py-1 text-xs font-semibold rounded-xl theme-muted border cursor-pointer focus:outline-none"
            >
              {database.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.clientName}
                </option>
              ))}
            </select>
          </div>

          <nav aria-label="Разделы приложения" className="row-start-2 md:row-start-1 md:col-start-2 min-w-0 w-full flex flex-wrap md:flex-nowrap items-center justify-center gap-1 sm:gap-2 xl:gap-3">
            {[...primaryTabs, ...secondaryTabs].map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveScreen(item.id);
                    setMoreMenuOpen(false);
                  }}
                  className={`nav-inline-${item.id} relative px-2 sm:px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? 'theme-btn-primary shadow-xs'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Кнопка второстепенных разделов */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={moreMenuOpen}
                onClick={() => setMoreMenuOpen((v) => !v)}
                className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1 ${
                  [...primaryTabs, ...secondaryTabs].some((t) => t.id === activeScreen && t.id !== 'workspace')
                    ? 'theme-btn-primary'
                    : 'theme-muted opacity-80 hover:opacity-100'
                }`}
              >
                <span>Ещё</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {moreMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 mt-2 w-56 rounded-2xl theme-surface border p-2 shadow-xl z-50 space-y-1"
                  >
                    <div className="px-3 py-2 xl:hidden">
                      <label htmlFor="mobile-session" className="block mb-1.5 text-xs font-semibold">Активная сделка</label>
                      <select
                        id="mobile-session"
                        value={activeSession.id}
                        onChange={(e) => {
                          persistDatabase({ ...database, activeSessionId: e.target.value });
                          setMoreMenuOpen(false);
                        }}
                        className="w-full min-w-0 px-2.5 py-2 text-xs rounded-xl theme-muted border cursor-pointer"
                      >
                        {database.sessions.map((s) => (
                          <option key={s.id} value={s.id}>{s.clientName}</option>
                        ))}
                      </select>
                    </div>
                    {[...primaryTabs, ...secondaryTabs].map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          setActiveScreen(sec.id);
                          setMoreMenuOpen(false);
                        }}
                        className={`nav-overflow-${sec.id} w-full items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                          activeScreen === sec.id
                            ? 'theme-accent-badge font-bold'
                            : 'hover:opacity-80'
                        }`}
                      >
                        {sec.icon}
                        <span>{sec.label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        handleQuickExportMarkdown();
                        setMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl hover:opacity-80 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Экспорт отчёта (.md)</span>
                    </button>
                    <div
                      className="pt-1.5 mt-1.5 border-t"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <a
                        href={SOURCE_DOWNLOAD_URL}
                        download="tkp-advisor-webstorm.zip"
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold theme-accent-text rounded-xl hover:opacity-80 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Скачать ZIP (WebStorm)
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

        </div>
      </header>

      {/* Просторный центрированный контейнер без нагромождения */}
      <main className="flex-1 min-w-0 w-full px-4 sm:px-8 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeScreen}-${activeSession.id}-${palette}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeScreen === 'sessions' && (
              <SessionsView
                sessions={database.sessions}
                activeSessionId={activeSession.id}
                onSelectSession={(sessionId, openWorkspace) => {
                  persistDatabase({ ...database, activeSessionId: sessionId });
                  setActiveScreen(openWorkspace ? 'workspace' : 'context');
                }}
                onCreateSession={handleCreateSession}
                onToggleArchiveSession={handleToggleArchiveSession}
              />
            )}

            {activeScreen === 'context' && (
              <ContextView
                session={activeSession}
                onSaveContext={handleSaveContext}
                onStartWorkspace={() => setActiveScreen('workspace')}
              />
            )}

            {activeScreen === 'workspace' && (
              <WorkspaceView
                session={activeSession}
                directory={database.directory}
                settings={database.settings}
                onAddReplyAndAnalyze={handleAddReplyAndAnalyze}
                onAcceptEdit={handleAcceptEdit}
                onRejectEdit={handleRejectEdit}
                onDeferEdit={handleDeferEdit}
                onNavigateToScreen={(scr) => setActiveScreen(scr)}
              />
            )}

            {activeScreen === 'tkp' && (
              <TkpView
                session={activeSession}
                directory={database.directory}
                onUpdateItemFeasibility={handleUpdateItemFeasibility}
                onUpdateItemCommentOrCost={handleUpdateItemCommentOrCost}
                onAddTkpItem={handleAddTkpItem}
                onDeleteTkpItem={handleDeleteTkpItem}
              />
            )}

            {activeScreen === 'directory' && (
              <DirectoryView
                directory={database.directory}
                settings={database.settings}
                industryContext={activeSession.context.industry}
                onAddOrUpdateRecord={handleAddOrUpdateRecord}
                onDeleteRecord={handleDeleteRecord}
                onRefreshMarketData={handleRefreshMarketData}
              />
            )}

            {activeScreen === 'metrics' && (
              <MetricsView
                session={activeSession}
                directory={database.directory}
              />
            )}

            {activeScreen === 'settings' && (
              <SettingsView
                database={database}
                onUpdateSettings={handleUpdateSettings}
                onImportDatabaseJson={(importedDb) => persistDatabase(importedDb)}
                onResetToDefaultDemo={() => {
                  if (IS_STATIC_HOSTING) {
                    persistDatabase(INITIAL_DATABASE);
                    return;
                  }
                  fetch('/api/backup/reset', { method: 'POST' })
                    .then((res) => (res.ok ? res.json() : INITIAL_DATABASE))
                    .then((resetDb) => {
                      setDatabase(resetDb);
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(resetDb));
                    })
                    .catch(() => {
                      setDatabase(INITIAL_DATABASE);
                    });
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
