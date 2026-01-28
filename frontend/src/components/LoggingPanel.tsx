import { useState, useEffect, useCallback, useRef, memo } from "react";
import { getLogs, getLogStats, clearLogs, exportLogs, type LogEntry, type LogsResponse, type LogStats } from "../services/api";
import "./LoggingPanel.css";

type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

const LEVEL_COLORS: Record<LogLevel, { bg: string; text: string; border: string }> = {
  DEBUG: { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  INFO: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  WARNING: { bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  ERROR: { bg: "#fee2e2", text: "#dc2626", border: "#fca5a5" },
  CRITICAL: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  DEBUG: "🔍",
  INFO: "ℹ️",
  WARNING: "⚠️",
  ERROR: "❌",
  CRITICAL: "🔥",
};

function LoggingPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(0);

  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(
    new Set(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
  );
  const [searchText, setSearchText] = useState("");
  const [loggerFilter, setLoggerFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [limit, setLimit] = useState(200);

  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const levels = Array.from(selectedLevels).join(",");
      const response: LogsResponse = await getLogs({
        levels: levels || undefined,
        search: searchText || undefined,
        logger: loggerFilter || undefined,
        limit,
      });
      setLogs(response.logs);
      setTotal(response.total);
      setFiltered(response.filtered);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    }
  }, [selectedLevels, searchText, loggerFilter, limit]);

  const fetchStats = useCallback(async () => {
    try {
      const statsData = await getLogStats();
      setStats(statsData);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchLogs(), fetchStats()]);
    setLoading(false);
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs, fetchStats]);

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all logs?")) return;
    try {
      await clearLogs();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs");
    }
  };

  const handleExport = async (format: "json" | "text") => {
    try {
      const blob = await exportLogs(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "json" ? "logs.json" : "app.log";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export logs");
    }
  };

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const selectAllLevels = () => {
    setSelectedLevels(new Set(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]));
  };

  const selectNoneLevels = () => {
    setSelectedLevels(new Set());
  };

  const toggleExpanded = (index: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="logging-panel" role="region" aria-label="Application logging dashboard">
      <div className="logging-header">
        <div className="logging-title">
          <span style={{ fontSize: "1.75rem" }} aria-hidden="true">📋</span>
          <div>
            <h2>Application Logs</h2>
            <p>Real-time logging with filtering and export</p>
          </div>
        </div>
        <div className="logging-actions" role="toolbar" aria-label="Log actions">
          <button 
            className="btn btn-secondary" 
            onClick={() => loadData()}
            aria-label="Refresh logs"
          >
            <span aria-hidden="true">🔄</span> Refresh
          </button>
          <button
            className={`auto-refresh-toggle ${autoRefresh ? "active" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            aria-pressed={autoRefresh}
            aria-label={autoRefresh ? "Pause auto-refresh" : "Enable auto-refresh"}
          >
            {autoRefresh ? "⏸️ Pause" : "▶️ Live"}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => handleExport("json")}
            aria-label="Export logs as JSON"
          >
            <span aria-hidden="true">📥</span> JSON
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => handleExport("text")}
            aria-label="Export logs as text"
          >
            <span aria-hidden="true">📄</span> Text
          </button>
          <button 
            className="btn btn-danger" 
            onClick={handleClearLogs}
            aria-label="Clear all logs"
          >
            <span aria-hidden="true">🗑️</span> Clear
          </button>
        </div>
      </div>

      {stats && (
        <div className="stats-bar" role="region" aria-label="Log statistics">
          <div className="stat-item">
            <span className="stat-label">Total Entries</span>
            <span className="stat-value">{stats.total_entries.toLocaleString()}</span>
          </div>
          <div className="stat-divider" aria-hidden="true" />
          <div className="stat-item">
            <span className="stat-label">File Size</span>
            <span className="stat-value">{formatFileSize(stats.file_size_bytes)}</span>
          </div>
          <div className="stat-divider" aria-hidden="true" />
          <div className="stat-item">
            <span className="stat-label">By Level</span>
            <div className="level-stats" role="list" aria-label="Log counts by level">
              {(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as LogLevel[]).map((level) => (
                <span
                  key={level}
                  className="level-stat"
                  role="listitem"
                  style={{
                    background: LEVEL_COLORS[level].bg,
                    color: LEVEL_COLORS[level].text,
                    border: `1px solid ${LEVEL_COLORS[level].border}`,
                  }}
                >
                  {LEVEL_ICONS[level]} {stats.by_level[level] || 0}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="filters-section" role="search" aria-label="Log filters">
        <div className="filter-row">
          <div className="filter-group" role="group" aria-labelledby="level-filter-label">
            <span className="filter-label" id="level-filter-label">Log Levels</span>
            <div className="level-filters" role="group">
              {(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as LogLevel[]).map((level) => (
                <button
                  key={level}
                  className={`level-toggle ${selectedLevels.has(level) ? "active" : ""}`}
                  style={{
                    background: LEVEL_COLORS[level].bg,
                    color: LEVEL_COLORS[level].text,
                    borderColor: LEVEL_COLORS[level].border,
                  }}
                  onClick={() => toggleLevel(level)}
                  aria-pressed={selectedLevels.has(level)}
                  aria-label={`Filter ${level} logs`}
                >
                  <span aria-hidden="true">{LEVEL_ICONS[level]}</span> {level}
                </button>
              ))}
              <div className="level-actions">
                <button className="btn-link" onClick={selectAllLevels} aria-label="Select all log levels">All</button>
                <button className="btn-link" onClick={selectNoneLevels} aria-label="Deselect all log levels">None</button>
              </div>
            </div>
          </div>
        </div>
        <div className="filter-row">
          <div className="filter-group">
            <label className="filter-label" htmlFor="search-messages">Search Messages</label>
            <input
              id="search-messages"
              type="text"
              className="filter-input"
              placeholder="Search in messages..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Search log messages"
            />
          </div>
          <div className="filter-group">
            <label className="filter-label" htmlFor="logger-filter">Logger Filter</label>
            <input
              id="logger-filter"
              type="text"
              className="filter-input"
              placeholder="Filter by logger name..."
              value={loggerFilter}
              onChange={(e) => setLoggerFilter(e.target.value)}
              aria-label="Filter by logger name"
            />
          </div>
          <div className="filter-group">
            <label className="filter-label" htmlFor="log-limit">Limit</label>
            <select
              id="log-limit"
              className="filter-input"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Number of logs to display"
            >
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
          <button className="btn-link" onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</button>
        </div>
      )}

      <div className="logs-container" role="region" aria-label="Log entries">
        <div className="logs-header">
          <span className="logs-count" role="status" aria-live="polite">
            Showing <strong>{logs.length}</strong> of <strong>{filtered}</strong> filtered logs
            (total: {total})
          </span>
        </div>
        <div className="logs-scroll" ref={logContainerRef} role="log" aria-label="Log messages">
          {loading ? (
            <div className="loading-overlay" role="status" aria-live="polite">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="empty-logs" role="status">
              <span className="empty-logs-icon" aria-hidden="true">📭</span>
              <span>No logs match the current filters</span>
            </div>
          ) : (
            logs.map((log, index) => {
              const isExpanded = expandedLogs.has(index);
              const levelColors = LEVEL_COLORS[log.level as LogLevel] || LEVEL_COLORS.INFO;
              return (
                <div
                  key={`${log.timestamp}-${index}`}
                  className={`log-entry ${isExpanded ? "expanded" : ""}`}
                  role="article"
                  aria-label={`${log.level} log from ${log.logger}`}
                >
                  <div 
                    className="log-main" 
                    onClick={() => toggleExpanded(index)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => e.key === "Enter" && toggleExpanded(index)}
                  >
                    <span className="log-time">
                      <span className="log-date">{formatDate(log.timestamp)}</span>
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <span
                      className="log-level"
                      style={{
                        background: levelColors.bg,
                        color: levelColors.text,
                        borderColor: levelColors.border,
                      }}
                    >
                      {LEVEL_ICONS[log.level as LogLevel]} {log.level}
                    </span>
                    <span className="log-logger" title={log.logger}>
                      {log.logger}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                  {isExpanded && (
                    <div className="log-details">
                      <div className="log-detail-row">
                        <span className="log-detail-label">Full Timestamp:</span>
                        <span className="log-detail-value">{log.timestamp}</span>
                      </div>
                      <div className="log-detail-row">
                        <span className="log-detail-label">Logger:</span>
                        <span className="log-detail-value">{log.logger}</span>
                      </div>
                      {log.module && (
                        <div className="log-detail-row">
                          <span className="log-detail-label">Module:</span>
                          <span className="log-detail-value">{log.module}</span>
                        </div>
                      )}
                      {log.function && (
                        <div className="log-detail-row">
                          <span className="log-detail-label">Function:</span>
                          <span className="log-detail-value">{log.function}</span>
                        </div>
                      )}
                      {log.line && (
                        <div className="log-detail-row">
                          <span className="log-detail-label">Line:</span>
                          <span className="log-detail-value">{log.line}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(LoggingPanel);