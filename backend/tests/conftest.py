import os

# app.main builds the FastAPI app at import time (so a missing/invalid
# DATABASE_URL fails fast under `uvicorn app.main:app`). Give import-time
# construction a placeholder so test collection doesn't require a real
# database; tests that need one build a fresh app via create_app() with
# real settings after setting the env vars they care about.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://placeholder:placeholder@localhost/placeholder"
)
