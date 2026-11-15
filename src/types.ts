/**
 * Строгие типы сущностей и контрактов данных системы «ТКП-Советник»
 * В соответствии с разделом 8 ТЗ (Модель данных)
 */

export type SessionStatus = 'draft' | 'active' | 'archived';

export type MessageType = 'thought' | 'client_reply';

export type EditType =
  | 'price'
  | 'deadline'
  | 'scope'
  | 'payment_terms'
  | 'warranty'
  | 'wording';

export type EditStatus = 'proposed' | 'accepted' | 'rejected' | 'deferred';

export type FeasibilityStatus = 'feasible' | 'questionable' | 'infeasible';

export type ReliabilityStatus = 'fact' | 'assumption';

export type AppScreen =
  | 'sessions'
  | 'context'
  | 'workspace'
  | 'tkp'
  | 'directory'
  | 'metrics'
  | 'settings';

export interface TradingContext {
  sessionId: string;
  clientDescription: string;
  industry: string;
  decisionMaker: string;
  relationshipHistory: string;
  budgetMin: number;
  budgetMax: number;
  deadlines: string;
  clientTasks: string;
  clientProblems: string;
  warmthScale: number; // 1..10
  tkpDraft: string;
  taskDecomposition: string;
  clarifyingQuestions: string[];
}

export interface TkpItem {
  id: string;
  sessionId: string;
  code: string;
  title: string;
  category: string;
  value: string;
  cost: number;
  durationDays: number;
  feasibility: FeasibilityStatus;
  comment: string;
}

export interface AnalysisStatement {
  id: string;
  text: string;
  kind: 'fact' | 'assumption';
}

export interface AnalysisResult {
  id: string;
  messageId: string;
  interpretation: string;
  clientPosition: {
    motives: string;
    constraints: string;
    priorities: string;
  };
  statements: AnalysisStatement[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  confidence: number; // 0..100
  usedDirectoryIds: string[];
}

export interface BrainstormMessage {
  id: string;
  sessionId: string;
  type: MessageType;
  authorLabel: string;
  text: string;
  createdAt: string;
  linkedTkpItemId?: string;
  analysis?: AnalysisResult;
}

export interface RejectionRecord {
  id: string;
  editId: string;
  sessionId: string;
  editType: EditType;
  summary: string;
  reason: string;
  contextSnapshot: string;
  createdAt: string;
}

export interface TkpEdit {
  id: string;
  sessionId: string;
  messageId?: string;
  linkedTkpItemId?: string;
  type: EditType;
  title: string;
  currentValue: string;
  proposedValue: string;
  priceDelta: number; // Рубли: + повышение, - уступка, 0 без изменения цены
  attractivenessDelta: number; // Прогноз влияния на привлекательность
  rationale: string;
  expectedEffect: string;
  status: EditStatus;
  rejectionReason?: string;
  previouslyRejectedWarning?: string;
  goalConflictWarning?: string;
  usedDirectoryIds?: string[];
  createdAt: string;
  decidedAt?: string;
}

export interface MarketRecord {
  id: string;
  analogName: string;
  industry: string;
  priceMin: number;
  priceMax: number;
  conditions: string;
  sourceTitle: string;
  sourceUrl: string;
  fetchedAt: string; // YYYY-MM-DD
  reliability: ReliabilityStatus;
  isManual: boolean;
  comment: string;
}

export interface AttractivenessFactor {
  name: string;
  score: number; // 0..100
  comment: string;
}

export interface EvaluationSnapshot {
  id: string;
  sessionId: string;
  cycleNumber: number;
  label: string;
  timestamp: string;
  totalPrice: number;
  feasibilityScore: number; // 0..100 (% выполнимых пунктов)
  attractivenessScore: number; // 0..100 (LLM-оценка)
  attractivenessRationale: string;
  factors: AttractivenessFactor[];
}

export interface TradingSession {
  id: string;
  title: string;
  clientName: string;
  status: SessionStatus;
  initialPrice: number;
  createdAt: string;
  updatedAt: string;
  context: TradingContext;
  items: TkpItem[];
  messages: BrainstormMessage[];
  edits: TkpEdit[];
  rejections: RejectionRecord[];
  evaluations: EvaluationSnapshot[];
}

export interface AppSettings {
  staleThresholdDays: number;
  requireRejectionReason: boolean;
  llmProviderLabel: string;
  localDbPath: string;
  searchRegion: string;
  maxSearchQueriesPerRun: number;
  simulateNetworkLatencyMs: number;
  simulateLlmErrorOnce: boolean;
}

export interface AppDatabase {
  sessions: TradingSession[];
  activeSessionId: string;
  directory: MarketRecord[];
  settings: AppSettings;
}
