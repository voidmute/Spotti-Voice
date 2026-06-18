import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Trash2 } from "lucide-react";
import {
  deleteHistoryEntry,
  fetchHistory,
  subscribeEngineEvents,
  type TranscriptEntry,
} from "../lib/engineApi";

type HistoryPanelProps = {
  base: string;
  engineOnline: boolean;
};

const PAGE_SIZE = 4;

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function HistoryRow({
  entry,
  onDelete,
}: {
  entry: TranscriptEntry;
  onDelete: (id: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  return (
    <li className="history-row">
      <div className="history-row__meta">
        <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
        <span className="history-row__mode">{entry.sttMode === "cloud" ? "Облако" : "Локально"}</span>
      </div>

      <p className="history-row__text">{entry.text}</p>

      <div className="history-row__actions">
        <button
          type="button"
          className={`history-icon-btn${copied ? " is-copied" : ""}`}
          aria-label="Копировать"
          onClick={() => void copyText()}
        >
          {copied ? <Check size={15} strokeWidth={2.25} /> : <Copy size={15} strokeWidth={2.25} />}
        </button>
        <button
          type="button"
          className="history-icon-btn history-icon-btn--danger"
          aria-label="Удалить"
          onClick={() => void onDelete(entry.id)}
        >
          <Trash2 size={15} strokeWidth={2.25} />
        </button>
      </div>
    </li>
  );
}

export function HistoryPanel({ base, engineOnline }: HistoryPanelProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = page * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  useEffect(() => {
    setPage(0);
  }, [entries.length]);

  const reload = useCallback(async () => {
    if (!engineOnline) return;
    try {
      const list = await fetchHistory(base);
      setEntries(list);
      setError("");
    } catch {
      setError("Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, [base, engineOnline]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!engineOnline) return;
    return subscribeEngineEvents(base, (event) => {
      if (event.type !== "history") return;
      setEntries((prev) => {
        if (prev.some((e) => e.id === event.entry.id)) return prev;
        return [event.entry, ...prev];
      });
    });
  }, [base, engineOnline]);

  async function handleDelete(id: string) {
    await deleteHistoryEntry(base, id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return (
      <div className="history-empty">
        <Loader2 className="settings-loading__spin" size={22} strokeWidth={2} />
        <span>Загрузка истории…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-empty history-empty--error">
        <p>{error}</p>
        <button type="button" className="history-retry" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="history-empty">
        <p className="history-empty__title">Пока пусто</p>
        <p className="history-empty__hint">
          Удерживайте горячую клавишу и говорите. Каждая фраза появится здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="history-shell">
      <ul className="history-list history-list--compact" aria-label="История распознанной речи">
        {pageItems.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} onDelete={handleDelete} />
        ))}
      </ul>
      {entries.length > PAGE_SIZE ? (
        <div className="history-pager">
          <button
            type="button"
            className="history-pager__btn"
            tabIndex={-1}
            disabled={page <= 0}
            aria-label="Предыдущая страница"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={16} strokeWidth={2.25} />
          </button>
          <span className="history-pager__label">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="history-pager__btn"
            tabIndex={-1}
            disabled={page >= pageCount - 1}
            aria-label="Следующая страница"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight size={16} strokeWidth={2.25} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
