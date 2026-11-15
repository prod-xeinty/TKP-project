import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import {
  AppDatabase,
  AppSettings,
  BrainstormMessage,
  EvaluationSnapshot,
  FeasibilityStatus,
  MarketRecord,
  RejectionRecord,
  SessionStatus,
  TkpEdit,
  TkpItem,
  TradingContext,
  TradingSession,
} from '../../src/types';
import { INITIAL_DATABASE } from '../../src/data/initialData';

const require = createRequire(import.meta.url);

const dbFilePath = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'tkp_advisor.sqlite');
const jsonFallbackPath = path.resolve(process.cwd(), 'data', 'tkp_advisor.json');
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

interface SqliteStatementAdapter {
  run: (...params: any[]) => any;
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
}

interface SqliteAdapter {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatementAdapter;
  transaction: <T>(fn: (arg: T) => void) => (arg: T) => void;
  isJsonFallback?: boolean;
}

function createSqliteAdapter(): SqliteAdapter {
  // 1. Попытка загрузить better-sqlite3 (работает в Linux-контейнере и при наличии бинарника)
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(dbFilePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch {
    // Игнорируем ошибку, если установлено с --ignore-scripts без Visual Studio C++
  }

  // 2. Попытка использовать встроенный модуль node:sqlite (встроен в Node.js 22.5+ / Node 24 без C++ компиляции)
  try {
    const nodeSqlite = require('node:sqlite');
    if (nodeSqlite && nodeSqlite.DatabaseSync) {
      const db = new nodeSqlite.DatabaseSync(dbFilePath);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      return {
        exec: (sql: string) => db.exec(sql),
        prepare: (sql: string) => {
          const stmt = db.prepare(sql);
          return {
            run: (...params: any[]) => stmt.run(...params),
            get: (...params: any[]) => stmt.get(...params),
            all: (...params: any[]) => stmt.all(...params) as any[],
          };
        },
        transaction: <T>(fn: (arg: T) => void) => {
          return (arg: T) => {
            db.exec('BEGIN');
            try {
              fn(arg);
              db.exec('COMMIT');
            } catch (err) {
              db.exec('ROLLBACK');
              throw err;
            }
          };
        },
      };
    }
  } catch {
    // Переход к файловому хранилищу
  }

  // 3. Безотказный резервный JSON-движок на случай отсутствия нативных бинарников
  return {
    isJsonFallback: true,
    exec: () => {},
    prepare: () => ({
      run: () => ({}),
      get: () => ({ cnt: 0 }),
      all: () => [],
    }),
    transaction: <T>(fn: (arg: T) => void) => (arg: T) => fn(arg),
  };
}

export const sqlite: SqliteAdapter = createSqliteAdapter();

/**
 * Инициализация схемы SQLite согласно разделу 8 ТЗ (Модель данных)
 */
export function initDatabaseSchema(): void {
  if (sqlite.isJsonFallback) {
    if (!fs.existsSync(jsonFallbackPath)) {
      fs.writeFileSync(jsonFallbackPath, JSON.stringify(INITIAL_DATABASE, null, 2), 'utf-8');
    }
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      stale_threshold_days INTEGER NOT NULL DEFAULT 90,
      require_rejection_reason INTEGER NOT NULL DEFAULT 1,
      llm_provider_label TEXT NOT NULL,
      local_db_path TEXT NOT NULL,
      search_region TEXT NOT NULL,
      max_search_queries_per_run INTEGER NOT NULL DEFAULT 5,
      simulate_network_latency_ms INTEGER NOT NULL DEFAULT 400,
      simulate_llm_error_once INTEGER NOT NULL DEFAULT 0,
      active_session_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      client_name TEXT NOT NULL,
      status TEXT NOT NULL,
      initial_price REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contexts (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      client_description TEXT NOT NULL,
      industry TEXT NOT NULL,
      decision_maker TEXT NOT NULL,
      relationship_history TEXT NOT NULL,
      budget_min REAL NOT NULL,
      budget_max REAL NOT NULL,
      deadlines TEXT NOT NULL,
      client_tasks TEXT NOT NULL,
      client_problems TEXT NOT NULL,
      warmth_scale INTEGER NOT NULL,
      tkp_draft TEXT NOT NULL,
      task_decomposition TEXT NOT NULL,
      clarifying_questions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tkp_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      cost REAL NOT NULL,
      duration_days INTEGER NOT NULL,
      feasibility TEXT NOT NULL,
      comment TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      author_label TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      linked_tkp_item_id TEXT
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      interpretation TEXT NOT NULL,
      motives TEXT NOT NULL,
      constraints_text TEXT NOT NULL,
      priorities TEXT NOT NULL,
      statements_json TEXT NOT NULL,
      risks_json TEXT NOT NULL,
      opportunities_json TEXT NOT NULL,
      recommendations_json TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      used_directory_ids_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edits (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_id TEXT,
      linked_tkp_item_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      current_value TEXT NOT NULL,
      proposed_value TEXT NOT NULL,
      price_delta REAL NOT NULL,
      attractiveness_delta REAL NOT NULL,
      rationale TEXT NOT NULL,
      expected_effect TEXT NOT NULL,
      status TEXT NOT NULL,
      rejection_reason TEXT,
      previously_rejected_warning TEXT,
      goal_conflict_warning TEXT,
      used_directory_ids_json TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rejections (
      id TEXT PRIMARY KEY,
      edit_id TEXT UNIQUE NOT NULL REFERENCES edits(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      edit_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      reason TEXT NOT NULL,
      context_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      total_price REAL NOT NULL,
      feasibility_score REAL NOT NULL,
      attractiveness_score REAL NOT NULL,
      attractiveness_rationale TEXT NOT NULL,
      factors_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS directory (
      id TEXT PRIMARY KEY,
      analog_name TEXT NOT NULL,
      industry TEXT NOT NULL,
      price_min REAL NOT NULL,
      price_max REAL NOT NULL,
      conditions TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      reliability TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      comment TEXT NOT NULL
    );
  `);

  const countRow = sqlite.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number };
  if (!countRow || Number(countRow.cnt) === 0) {
    seedDatabaseWithInitialState(INITIAL_DATABASE);
  }
}

/**
 * Полная перезапись БД начальным или импортированным состоянием (в транзакции)
 */
export function seedDatabaseWithInitialState(data: AppDatabase): void {
  if (sqlite.isJsonFallback) {
    fs.writeFileSync(jsonFallbackPath, JSON.stringify(data, null, 2), 'utf-8');
    return;
  }

  const tx = sqlite.transaction((dbData: AppDatabase) => {
    sqlite.exec(`
      DELETE FROM rejections;
      DELETE FROM analyses;
      DELETE FROM messages;
      DELETE FROM edits;
      DELETE FROM tkp_items;
      DELETE FROM evaluations;
      DELETE FROM metrics;
      DELETE FROM contexts;
      DELETE FROM sessions;
      DELETE FROM directory;
      DELETE FROM settings;
    `);

    sqlite
      .prepare(
        `INSERT INTO settings (
          id, stale_threshold_days, require_rejection_reason, llm_provider_label,
          local_db_path, search_region, max_search_queries_per_run,
          simulate_network_latency_ms, simulate_llm_error_once, active_session_id
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dbData.settings.staleThresholdDays,
        dbData.settings.requireRejectionReason ? 1 : 0,
        dbData.settings.llmProviderLabel,
        dbData.settings.localDbPath || dbFilePath,
        dbData.settings.searchRegion,
        dbData.settings.maxSearchQueriesPerRun,
        dbData.settings.simulateNetworkLatencyMs,
        dbData.settings.simulateLlmErrorOnce ? 1 : 0,
        dbData.activeSessionId
      );

    const insertDir = sqlite.prepare(`
      INSERT INTO directory (
        id, analog_name, industry, price_min, price_max, conditions,
        source_title, source_url, fetched_at, reliability, is_manual, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rec of dbData.directory) {
      insertDir.run(
        rec.id,
        rec.analogName,
        rec.industry,
        rec.priceMin,
        rec.priceMax,
        rec.conditions,
        rec.sourceTitle,
        rec.sourceUrl,
        rec.fetchedAt,
        rec.reliability,
        rec.isManual ? 1 : 0,
        rec.comment
      );
    }

    const insertSession = sqlite.prepare(`
      INSERT INTO sessions (id, title, client_name, status, initial_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertContext = sqlite.prepare(`
      INSERT INTO contexts (
        session_id, client_description, industry, decision_maker, relationship_history,
        budget_min, budget_max, deadlines, client_tasks, client_problems,
        warmth_scale, tkp_draft, task_decomposition, clarifying_questions_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = sqlite.prepare(`
      INSERT INTO tkp_items (
        id, session_id, code, title, category, value, cost, duration_days, feasibility, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMsg = sqlite.prepare(`
      INSERT INTO messages (id, session_id, type, author_label, text, created_at, linked_tkp_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAnalysis = sqlite.prepare(`
      INSERT INTO analyses (
        id, message_id, interpretation, motives, constraints_text, priorities,
        statements_json, risks_json, opportunities_json, recommendations_json,
        confidence, used_directory_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdit = sqlite.prepare(`
      INSERT INTO edits (
        id, session_id, message_id, linked_tkp_item_id, type, title,
        current_value, proposed_value, price_delta, attractiveness_delta,
        rationale, expected_effect, status, rejection_reason,
        previously_rejected_warning, goal_conflict_warning, used_directory_ids_json,
        created_at, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRejection = sqlite.prepare(`
      INSERT INTO rejections (id, edit_id, session_id, edit_type, summary, reason, context_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEval = sqlite.prepare(`
      INSERT INTO evaluations (
        id, session_id, cycle_number, label, timestamp, total_price,
        feasibility_score, attractiveness_score, attractiveness_rationale, factors_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of dbData.sessions) {
      insertSession.run(
        s.id,
        s.title,
        s.clientName,
        s.status,
        s.initialPrice,
        s.createdAt,
        s.updatedAt
      );

      insertContext.run(
        s.id,
        s.context.clientDescription,
        s.context.industry,
        s.context.decisionMaker,
        s.context.relationshipHistory,
        s.context.budgetMin,
        s.context.budgetMax,
        s.context.deadlines,
        s.context.clientTasks,
        s.context.clientProblems,
        s.context.warmthScale,
        s.context.tkpDraft,
        s.context.taskDecomposition,
        JSON.stringify(s.context.clarifyingQuestions || [])
      );

      for (const item of s.items) {
        insertItem.run(
          item.id,
          s.id,
          item.code,
          item.title,
          item.category,
          item.value,
          item.cost,
          item.durationDays,
          item.feasibility,
          item.comment
        );
      }

      for (const msg of s.messages) {
        insertMsg.run(
          msg.id,
          s.id,
          msg.type,
          msg.authorLabel,
          msg.text,
          msg.createdAt,
          msg.linkedTkpItemId || null
        );
        if (msg.analysis) {
          const a = msg.analysis;
          insertAnalysis.run(
            a.id,
            msg.id,
            a.interpretation,
            a.clientPosition.motives,
            a.clientPosition.constraints,
            a.clientPosition.priorities,
            JSON.stringify(a.statements),
            JSON.stringify(a.risks),
            JSON.stringify(a.opportunities),
            JSON.stringify(a.recommendations),
            a.confidence,
            JSON.stringify(a.usedDirectoryIds)
          );
        }
      }

      for (const edit of s.edits) {
        insertEdit.run(
          edit.id,
          s.id,
          edit.messageId || null,
          edit.linkedTkpItemId || null,
          edit.type,
          edit.title,
          edit.currentValue,
          edit.proposedValue,
          edit.priceDelta,
          edit.attractivenessDelta,
          edit.rationale,
          edit.expectedEffect,
          edit.status,
          edit.rejectionReason || null,
          edit.previouslyRejectedWarning || null,
          edit.goalConflictWarning || null,
          JSON.stringify(edit.usedDirectoryIds || []),
          edit.createdAt,
          edit.decidedAt || null
        );
      }

      for (const rej of s.rejections) {
        insertRejection.run(
          rej.id,
          rej.editId,
          s.id,
          rej.editType,
          rej.summary,
          rej.reason,
          rej.contextSnapshot,
          rej.createdAt
        );
      }

      for (const ev of s.evaluations) {
        insertEval.run(
          ev.id,
          s.id,
          ev.cycleNumber,
          ev.label,
          ev.timestamp,
          ev.totalPrice,
          ev.feasibilityScore,
          ev.attractivenessScore,
          ev.attractivenessRationale,
          JSON.stringify(ev.factors || [])
        );
      }
    }
  });

  tx(data);
}

/**
 * Типизированное чтение полного состояния из SQLite
 */
export function loadFullDatabaseFromSqlite(): AppDatabase {
  if (sqlite.isJsonFallback) {
    try {
      if (fs.existsSync(jsonFallbackPath)) {
        return JSON.parse(fs.readFileSync(jsonFallbackPath, 'utf-8')) as AppDatabase;
      }
    } catch {
      // Fallback
    }
    return INITIAL_DATABASE;
  }

  const settingsRow = sqlite.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  const settings: AppSettings = settingsRow
    ? {
        staleThresholdDays: Number(settingsRow.stale_threshold_days),
        requireRejectionReason: Boolean(settingsRow.require_rejection_reason),
        llmProviderLabel: String(settingsRow.llm_provider_label),
        localDbPath: String(settingsRow.local_db_path),
        searchRegion: String(settingsRow.search_region),
        maxSearchQueriesPerRun: Number(settingsRow.max_search_queries_per_run),
        simulateNetworkLatencyMs: Number(settingsRow.simulate_network_latency_ms),
        simulateLlmErrorOnce: Boolean(settingsRow.simulate_llm_error_once),
      }
    : INITIAL_DATABASE.settings;

  const directoryRows = sqlite
    .prepare('SELECT * FROM directory ORDER BY fetched_at DESC, id DESC')
    .all() as any[];

  const directory: MarketRecord[] = directoryRows.map((r) => ({
    id: String(r.id),
    analogName: String(r.analog_name),
    industry: String(r.industry),
    priceMin: Number(r.price_min),
    priceMax: Number(r.price_max),
    conditions: String(r.conditions),
    sourceTitle: String(r.source_title),
    sourceUrl: String(r.source_url),
    fetchedAt: String(r.fetched_at),
    reliability: r.reliability as MarketRecord['reliability'],
    isManual: Boolean(r.is_manual),
    comment: String(r.comment),
  }));

  const sessionRows = sqlite
    .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
    .all() as any[];

  const sessions: TradingSession[] = sessionRows.map((sRow) => {
    const sid = String(sRow.id);
    const cRow = sqlite
      .prepare('SELECT * FROM contexts WHERE session_id = ?')
      .get(sid) as any;

    const context: TradingContext = cRow
      ? {
          sessionId: sid,
          clientDescription: String(cRow.client_description),
          industry: String(cRow.industry),
          decisionMaker: String(cRow.decision_maker),
          relationshipHistory: String(cRow.relationship_history),
          budgetMin: Number(cRow.budget_min),
          budgetMax: Number(cRow.budget_max),
          deadlines: String(cRow.deadlines),
          clientTasks: String(cRow.client_tasks),
          clientProblems: String(cRow.client_problems),
          warmthScale: Number(cRow.warmth_scale),
          tkpDraft: String(cRow.tkp_draft),
          taskDecomposition: String(cRow.task_decomposition),
          clarifyingQuestions: JSON.parse(cRow.clarifying_questions_json || '[]'),
        }
      : INITIAL_DATABASE.sessions[0].context;

    const itemRows = sqlite
      .prepare('SELECT * FROM tkp_items WHERE session_id = ? ORDER BY code ASC')
      .all(sid) as any[];
    const items: TkpItem[] = itemRows.map((i) => ({
      id: String(i.id),
      sessionId: sid,
      code: String(i.code),
      title: String(i.title),
      category: String(i.category),
      value: String(i.value),
      cost: Number(i.cost),
      durationDays: Number(i.duration_days),
      feasibility: i.feasibility as FeasibilityStatus,
      comment: String(i.comment),
    }));

    const msgRows = sqlite
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC')
      .all(sid) as any[];
    const messages: BrainstormMessage[] = msgRows.map((m) => {
      const aRow = sqlite
        .prepare('SELECT * FROM analyses WHERE message_id = ?')
        .get(String(m.id)) as any;

      return {
        id: String(m.id),
        sessionId: sid,
        type: m.type as BrainstormMessage['type'],
        authorLabel: String(m.author_label),
        text: String(m.text),
        createdAt: String(m.created_at),
        linkedTkpItemId: m.linked_tkp_item_id ? String(m.linked_tkp_item_id) : undefined,
        analysis: aRow
          ? {
              id: String(aRow.id),
              messageId: String(m.id),
              interpretation: String(aRow.interpretation),
              clientPosition: {
                motives: String(aRow.motives),
                constraints: String(aRow.constraints_text),
                priorities: String(aRow.priorities),
              },
              statements: JSON.parse(aRow.statements_json || '[]'),
              risks: JSON.parse(aRow.risks_json || '[]'),
              opportunities: JSON.parse(aRow.opportunities_json || '[]'),
              recommendations: JSON.parse(aRow.recommendations_json || '[]'),
              confidence: Number(aRow.confidence),
              usedDirectoryIds: JSON.parse(aRow.used_directory_ids_json || '[]'),
            }
          : undefined,
      };
    });

    const editRows = sqlite
      .prepare('SELECT * FROM edits WHERE session_id = ? ORDER BY created_at DESC, id DESC')
      .all(sid) as any[];
    const edits: TkpEdit[] = editRows.map((e) => ({
      id: String(e.id),
      sessionId: sid,
      messageId: e.message_id ? String(e.message_id) : undefined,
      linkedTkpItemId: e.linked_tkp_item_id ? String(e.linked_tkp_item_id) : undefined,
      type: e.type as TkpEdit['type'],
      title: String(e.title),
      currentValue: String(e.current_value),
      proposedValue: String(e.proposed_value),
      priceDelta: Number(e.price_delta),
      attractivenessDelta: Number(e.attractiveness_delta),
      rationale: String(e.rationale),
      expectedEffect: String(e.expected_effect),
      status: e.status as TkpEdit['status'],
      rejectionReason: e.rejection_reason ? String(e.rejection_reason) : undefined,
      previouslyRejectedWarning: e.previously_rejected_warning
        ? String(e.previously_rejected_warning)
        : undefined,
      goalConflictWarning: e.goal_conflict_warning
        ? String(e.goal_conflict_warning)
        : undefined,
      usedDirectoryIds: JSON.parse(e.used_directory_ids_json || '[]'),
      createdAt: String(e.created_at),
      decidedAt: e.decided_at ? String(e.decided_at) : undefined,
    }));

    const rejRows = sqlite
      .prepare('SELECT * FROM rejections WHERE session_id = ? ORDER BY created_at DESC')
      .all(sid) as any[];
    const rejections: RejectionRecord[] = rejRows.map((r) => ({
      id: String(r.id),
      editId: String(r.edit_id),
      sessionId: sid,
      editType: r.edit_type as RejectionRecord['editType'],
      summary: String(r.summary),
      reason: String(r.reason),
      contextSnapshot: String(r.context_snapshot),
      createdAt: String(r.created_at),
    }));

    const evalRows = sqlite
      .prepare('SELECT * FROM evaluations WHERE session_id = ? ORDER BY cycle_number ASC')
      .all(sid) as any[];
    const evaluations: EvaluationSnapshot[] = evalRows.map((ev) => ({
      id: String(ev.id),
      sessionId: sid,
      cycleNumber: Number(ev.cycle_number),
      label: String(ev.label),
      timestamp: String(ev.timestamp),
      totalPrice: Number(ev.total_price),
      feasibilityScore: Number(ev.feasibility_score),
      attractivenessScore: Number(ev.attractiveness_score),
      attractivenessRationale: String(ev.attractiveness_rationale),
      factors: JSON.parse(ev.factors_json || '[]'),
    }));

    return {
      id: sid,
      title: String(sRow.title),
      clientName: String(sRow.client_name),
      status: sRow.status as SessionStatus,
      initialPrice: Number(sRow.initial_price),
      createdAt: String(sRow.created_at),
      updatedAt: String(sRow.updated_at),
      context,
      items,
      messages,
      edits,
      rejections,
      evaluations,
    };
  });

  const activeSessionId =
    settingsRow?.active_session_id &&
    sessions.some((s) => s.id === settingsRow.active_session_id)
      ? String(settingsRow.active_session_id)
      : sessions[0]?.id || INITIAL_DATABASE.activeSessionId;

  return {
    sessions,
    activeSessionId,
    directory,
    settings,
  };
}
