from prometheus_client import Gauge, Histogram

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "beacon_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "route", "status"],
)

DB_POOL_SIZE = Gauge("beacon_db_pool_size", "Configured DB connection pool size")
DB_POOL_CHECKED_OUT = Gauge("beacon_db_pool_checked_out", "DB connections currently checked out")

BUILD_INFO = Gauge("beacon_build_info", "Build information", ["version", "git_sha"])
