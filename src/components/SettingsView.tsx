import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import { AppDatabase, AppSettings } from '../types';
import { downloadTextFile } from '../services/exportService';
import { TabHeroHeader } from './AnimatedText';

interface SettingsViewProps {
  database: AppDatabase;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onImportDatabaseJson: (importedDb: AppDatabase) => void;
  onResetToDefaultDemo: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  database,
  onUpdateSettings,
  onImportDatabaseJson,
  onResetToDefaultDemo,
}) => {
  const [form, setForm] = useState<AppSettings>(database.settings);
  const [savedNotice, setSavedNotice] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(form);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleExportFullBackup = () => {
    downloadTextFile(
      `TKP_Advisor_Backup_${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(database, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result)) as AppDatabase;
        if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.directory)) {
          throw new Error('Неверная структура JSON-файла базы данных.');
        }
        onImportDatabaseJson(parsed);
        setForm(parsed.settings);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2500);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : 'Не удалось прочитать JSON-файл резервной копии.'
        );
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-7">
      <TabHeroHeader
        kicker="Система и локальное хранилище"
        title="Настройки и архив проекта"
        subtitle="Параметры актуальности рыночных данных, резервное копирование базы SQLite и скачивание исходного кода для WebStorm."
      />

      {savedNotice && (
        <div className="p-3.5 text-xs font-semibold rounded-2xl theme-accent-badge flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Настройки сохранены.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 rounded-3xl theme-surface border p-6 sm:p-7 space-y-5 shadow-xs"
        >
          <h2 className="text-base font-bold">Параметры советника</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Порог устаревания (stale, дней)
              </label>
              <input
                type="number"
                min={7}
                max={365}
                value={form.staleThresholdDays}
                onChange={(e) =>
                  setForm({ ...form, staleThresholdDays: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm font-mono rounded-xl theme-muted border"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Лимит запросов за цикл сбора
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxSearchQueriesPerRun}
                onChange={(e) =>
                  setForm({ ...form, maxSearchQueriesPerRun: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm font-mono rounded-xl theme-muted border"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">Регион поиска аналогов</label>
            <input
              type="text"
              value={form.searchRegion}
              onChange={(e) => setForm({ ...form, searchRegion: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl theme-muted border"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs sm:text-sm cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.requireRejectionReason}
              onChange={(e) =>
                setForm({ ...form, requireRejectionReason: e.target.checked })
              }
              className="w-4 h-4"
              style={{ accentColor: 'var(--accent-main)' }}
            />
            <span>Требовать причину при отклонении правки ТКП</span>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Сохранить настройки
            </button>
          </div>
        </form>

        <div className="lg:col-span-5 rounded-3xl theme-surface border p-6 sm:p-7 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 theme-accent-text" />
            <h2 className="text-base font-bold">Выгрузка проекта и БД</h2>
          </div>

          {importError && (
            <div className="p-3 text-xs text-red-600 bg-red-500/10 rounded-xl">
              {importError}
            </div>
          )}

          <div className="space-y-2.5">
            <a
              href="/api/download-source-zip"
              download="tkp-advisor-webstorm.zip"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Скачать исходный код (.zip для WebStorm)
            </a>

            <button
              type="button"
              onClick={handleExportFullBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Экспортировать базу (.json)
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl theme-muted cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Импортировать базу (.json)
            </button>

            <button
              type="button"
              onClick={onResetToDefaultDemo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 rounded-xl cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Сбросить к эталонному демо-кейсу
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
