import contextvars
import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)

_RESERVED_ACCESS_LOG_FIELDS = {"method", "path", "route", "status", "duration_ms"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "service": "beacon-api",
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        for field in _RESERVED_ACCESS_LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(log_level: str) -> None:
    root = logging.getLogger()
    root.setLevel(log_level.upper())
    root.handlers.clear()

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Route uvicorn's own loggers through the same JSON handler.
    for name in ("uvicorn", "uvicorn.error"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers.clear()
        uv_logger.propagate = True

    # uvicorn.access duplicates app.access (see observability_middleware in
    # main.py) but fires after the request_id contextvar has been reset, so
    # every line would log request_id: null with no structured fields.
    # app.access is the documented access log (3T-APP-DESIGN.md §9); disable this one.
    logging.getLogger("uvicorn.access").disabled = True


def log_access(
    logger: logging.Logger,
    *,
    method: str,
    path: str,
    route: str,
    status: int,
    duration_ms: float,
) -> None:
    logger.info(
        "request",
        extra={
            "method": method,
            "path": path,
            "route": route,
            "status": status,
            "duration_ms": round(duration_ms, 2),
        },
    )
