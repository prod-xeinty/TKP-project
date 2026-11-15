import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDatabaseSchema,
  loadFullDatabaseFromSqlite,
  seedDatabaseWithInitialState,
} from './server/db/sqliteRepository';
import { analyzeUtteranceWithLlm } from './server/llm/llmService';
import { collectNormalizedMarketRecords } from './server/collector/marketCollector';
import { buildProjectSourceZip } from './server/zipBuilder';
import { INITIAL_DATABASE } from './src/data/initialData';
import {
  calculateFeasibilityScore,
  calculateSessionTotalPrice,
  createEvaluationSnapshotAfterEdit,
} from './src/services/advisorEngine';
import {
  AppDatabase,
  FeasibilityStatus,
  MarketRecord,
  TkpItem,
  TradingSession,
} from './src/types';

async function startServer() {
  initDatabaseSchema();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // 1. Получение полного состояния из локальной SQLite БД
  app.get('/api/state', (_req, res) => {
    try {
      const dbState = loadFullDatabaseFromSqlite();
      res.json(dbState);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка чтения базы данных SQLite',
      });
    }
  });

  // 2. Полная синхронизация состояния в SQLite (транзакционное сохранение)
  app.put('/api/state', (req, res) => {
    try {
      const incoming = req.body as AppDatabase;
      if (!incoming || !Array.isArray(incoming.sessions)) {
        res.status(400).json({ error: 'Некорректный формат состояния приложения' });
        return;
      }
      seedDatabaseWithInitialState(incoming);
      res.json(loadFullDatabaseFromSqlite());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка записи в SQLite',
      });
    }
  });

  // 3. Серверный LLM-анализ реплики и генерация правок ТКП с сохранением в SQLite
  app.post('/api/sessions/:sessionId/analyze', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { text, type, linkedTkpItemId } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Текст реплики обязателен' });
        return;
      }

      const dbState = loadFullDatabaseFromSqlite();
      const session = dbState.sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: 'Сессия торга не найдена' });
        return;
      }

      const { message, newEdits } = await analyzeUtteranceWithLlm({
        session,
        messageText: text.trim(),
        messageType: type === 'thought' ? 'thought' : 'client_reply',
        linkedTkpItemId: linkedTkpItemId || undefined,
        directory: dbState.directory,
      });

      const updatedSession: TradingSession = {
        ...session,
        status: 'active',
        updatedAt: new Date().toISOString().slice(0, 19),
        messages: [...session.messages, message],
        edits: [...newEdits, ...session.edits],
      };

      const nextDb: AppDatabase = {
        ...dbState,
        sessions: dbState.sessions.map((s) => (s.id === sessionId ? updatedSession : s)),
      };

      seedDatabaseWithInitialState(nextDb);
      res.json(loadFullDatabaseFromSqlite());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка при выполнении LLM-анализа',
      });
    }
  });

  // 4. Модуль сбора рыночных данных по кнопке (Раздел 11 ТЗ)
  app.post('/api/directory/collect', (req, res) => {
    try {
      const dbState = loadFullDatabaseFromSqlite();
      const activeSession =
        dbState.sessions.find((s) => s.id === dbState.activeSessionId) || dbState.sessions[0];
      const industry = req.body?.industry || activeSession?.context.industry || 'IT-разработка B2B';

      const freshRecords: MarketRecord[] = collectNormalizedMarketRecords({
        industry,
        searchRegion: dbState.settings.searchRegion,
      });

      const nextDb: AppDatabase = {
        ...dbState,
        // Ручные записи не перезаписываются (п. 11.3 ТЗ)
        directory: [...freshRecords, ...dbState.directory],
      };

      seedDatabaseWithInitialState(nextDb);
      res.json(loadFullDatabaseFromSqlite());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка сбора рыночных данных',
      });
    }
  });

  // 5. Сброс SQLite к начальному эталонному состоянию
  app.post('/api/backup/reset', (_req, res) => {
    try {
      seedDatabaseWithInitialState(INITIAL_DATABASE);
      res.json(loadFullDatabaseFromSqlite());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка сброса БД',
      });
    }
  });

  // 6. Выгрузка полного ZIP-архива исходного кода проекта для открытия в WebStorm
  app.get('/api/download-source-zip', (_req, res) => {
    try {
      const zipBuffer = buildProjectSourceZip(process.cwd());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="tkp-advisor-webstorm.zip"'
      );
      res.send(zipBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка сборки ZIP-архива проекта',
      });
    }
  });

  // Раздача фронтенда (Vite middleware в dev / статика в production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ТКП-Советник запущен локально: http://localhost:${PORT}`);
  });
}

startServer();
