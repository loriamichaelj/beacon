from datetime import UTC, datetime

from app.services.stats import bucket_for, bucket_starts


def test_bucket_for_window() -> None:
    assert bucket_for(7) == "day"
    assert bucket_for(31) == "day"
    assert bucket_for(90) == "week"


def test_daily_buckets_cover_partial_days_at_both_ends() -> None:
    start = datetime(2026, 9, 1, 15, 30, tzinfo=UTC)
    end = datetime(2026, 9, 3, 9, 0, tzinfo=UTC)
    assert bucket_starts(start, end, "day") == [
        datetime(2026, 9, 1, tzinfo=UTC),
        datetime(2026, 9, 2, tzinfo=UTC),
        datetime(2026, 9, 3, tzinfo=UTC),
    ]


def test_weekly_buckets_start_on_monday_utc() -> None:
    # 2026-09-10 is a Thursday; its week starts Monday 2026-09-07.
    start = datetime(2026, 9, 10, 12, tzinfo=UTC)
    end = datetime(2026, 9, 22, tzinfo=UTC)
    assert bucket_starts(start, end, "week") == [
        datetime(2026, 9, 7, tzinfo=UTC),
        datetime(2026, 9, 14, tzinfo=UTC),
        datetime(2026, 9, 21, tzinfo=UTC),
    ]
