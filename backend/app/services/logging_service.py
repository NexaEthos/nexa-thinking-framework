import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Optional
from enum import Enum
from pydantic import BaseModel
from threading import Lock


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogEntry(BaseModel):
    timestamp: str
    level: LogLevel
    logger: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    extra: Optional[dict] = None


class LogFilter(BaseModel):
    levels: Optional[list[LogLevel]] = None
    logger: Optional[str] = None
    search: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    limit: int = 500
    offset: int = 0


class LogsResponse(BaseModel):
    logs: list[LogEntry]
    total: int
    filtered: int


class FileLoggingHandler(logging.Handler):
    def __init__(self, log_file_path: Path, json_log_path: Path):
        super().__init__()
        self.log_file_path = log_file_path
        self.json_log_path = json_log_path
        self._lock = Lock()
        self._json_lock = Lock()
        self.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
        )

    def emit(self, record: logging.LogRecord) -> None:
        try:
            formatted_message = self.format(record)
            with self._lock:
                with open(self.log_file_path, "a", encoding="utf-8") as f:
                    f.write(formatted_message + "\n")

            log_entry = {
                "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "function": record.funcName,
                "line": record.lineno,
            }

            with self._json_lock:
                with open(self.json_log_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(log_entry) + "\n")

        except Exception:
            self.handleError(record)


class LoggingService:
    _instance: Optional["LoggingService"] = None
    _initialized: bool = False

    def __init__(self):
        if LoggingService._initialized:
            return

        self.logs_dir = Path("logs")
        self.logs_dir.mkdir(exist_ok=True)

        self.log_file_path = self.logs_dir / "app.log"
        self.json_log_path = self.logs_dir / "app.jsonl"

        self._clear_log_files()
        self._setup_file_handler()

        LoggingService._initialized = True

    def _clear_log_files(self) -> None:
        for log_path in [self.log_file_path, self.json_log_path]:
            if log_path.exists():
                log_path.unlink()
            log_path.touch()

    def _setup_file_handler(self) -> None:
        self.file_handler = FileLoggingHandler(
            self.log_file_path, self.json_log_path
        )
        self.file_handler.setLevel(logging.DEBUG)

        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)
        root_logger.addHandler(self.file_handler)

        for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"]:
            logger = logging.getLogger(logger_name)
            logger.addHandler(self.file_handler)
            logger.propagate = False

        noisy_loggers = [
            "httpcore",
            "httpcore.connection",
            "httpcore.http11",
            "httpcore.http2",
            "httpx",
            "hpack",
            "hpack.hpack",
            "hpack.table",
            "primp",
            "primp.utils",
            "rquest",
            "rquest.connect",
            "rquest.util",
            "rquest.util.client",
            "rquest.util.client.connect",
            "rquest.util.client.connect.dns",
            "rquest.util.client.connect.http",
            "rquest.util.client.pool",
            "cookie_store",
            "cookie_store.cookie_store",
            "ddgs",
            "ddgs.ddgs",
        ]
        for logger_name in noisy_loggers:
            logging.getLogger(logger_name).setLevel(logging.WARNING)

    @classmethod
    def get_instance(cls) -> "LoggingService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_logs(self, filter_params: LogFilter) -> LogsResponse:
        logs: list[LogEntry] = []

        if not self.json_log_path.exists():
            return LogsResponse(logs=[], total=0, filtered=0)

        with open(self.json_log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    logs.append(LogEntry(**data))
                except (json.JSONDecodeError, ValueError):
                    continue

        total = len(logs)
        filtered_logs = self._apply_filters(logs, filter_params)
        filtered_count = len(filtered_logs)

        start = filter_params.offset
        end = start + filter_params.limit
        paginated = filtered_logs[start:end]

        return LogsResponse(logs=paginated, total=total, filtered=filtered_count)

    def _apply_filters(
        self, logs: list[LogEntry], filter_params: LogFilter
    ) -> list[LogEntry]:
        result = logs

        if filter_params.levels:
            level_set = set(filter_params.levels)
            result = [log for log in result if log.level in level_set]

        if filter_params.logger:
            result = [
                log
                for log in result
                if filter_params.logger.lower() in log.logger.lower()
            ]

        if filter_params.search:
            search_lower = filter_params.search.lower()
            result = [
                log
                for log in result
                if search_lower in log.message.lower()
                or search_lower in log.logger.lower()
            ]

        if filter_params.start_time:
            result = [
                log for log in result if log.timestamp >= filter_params.start_time
            ]

        if filter_params.end_time:
            result = [
                log for log in result if log.timestamp <= filter_params.end_time
            ]

        result.reverse()
        return result

    def clear_logs(self) -> dict:
        self._clear_log_files()
        logging.getLogger(__name__).info("Logs cleared by user request")
        return {"message": "Logs cleared successfully"}

    def get_log_file_path(self) -> Path:
        return self.log_file_path

    def get_log_stats(self) -> dict[str, int | dict[str, int] | list[str]]:
        by_level: dict[str, int] = {level.value: 0 for level in LogLevel}
        loggers: set[str] = set()
        total_entries = 0
        file_size_bytes = 0

        if self.json_log_path.exists():
            file_size_bytes = self.json_log_path.stat().st_size

            with open(self.json_log_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        total_entries += 1
                        level = data.get("level", "INFO")
                        if level in by_level:
                            by_level[level] += 1
                        loggers.add(data.get("logger", "unknown"))
                    except (json.JSONDecodeError, ValueError):
                        continue

        return {
            "total_entries": total_entries,
            "by_level": by_level,
            "file_size_bytes": file_size_bytes,
            "loggers": sorted(loggers),
        }

    def export_logs(self, format_type: str = "json") -> str:
        if format_type == "json":
            logs_response = self.get_logs(LogFilter(limit=100000))
            return json.dumps([log.model_dump() for log in logs_response.logs], indent=2)
        else:
            if self.log_file_path.exists():
                return self.log_file_path.read_text(encoding="utf-8")
            return ""


def get_logging_service() -> LoggingService:
    return LoggingService.get_instance()
