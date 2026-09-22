from datetime import UTC, datetime

import pytest

from app.services.incidents import InvalidTransitionError, apply_transition

NOW = datetime(2026, 1, 1, tzinfo=UTC)
EARLIER = datetime(2025, 12, 31, tzinfo=UTC)

ALL_STATUSES = ("open", "mitigated", "resolved")


def test_open_to_mitigated_sets_mitigated_at() -> None:
    result = apply_transition(
        current_status="open",
        current_mitigated_at=None,
        current_resolved_at=None,
        current_reopen_count=0,
        new_status="mitigated",
        now=NOW,
    )
    assert result.status == "mitigated"
    assert result.mitigated_at == NOW
    assert result.resolved_at is None
    assert result.reopen_count == 0


def test_open_to_resolved_sets_resolved_and_backfills_mitigated() -> None:
    result = apply_transition(
        current_status="open",
        current_mitigated_at=None,
        current_resolved_at=None,
        current_reopen_count=0,
        new_status="resolved",
        now=NOW,
    )
    assert result.status == "resolved"
    assert result.mitigated_at == NOW
    assert result.resolved_at == NOW
    assert result.reopen_count == 0


def test_open_to_resolved_keeps_existing_mitigated_at() -> None:
    result = apply_transition(
        current_status="open",
        current_mitigated_at=EARLIER,
        current_resolved_at=None,
        current_reopen_count=0,
        new_status="resolved",
        now=NOW,
    )
    assert result.mitigated_at == EARLIER
    assert result.resolved_at == NOW


def test_mitigated_to_resolved_sets_resolved_at() -> None:
    result = apply_transition(
        current_status="mitigated",
        current_mitigated_at=EARLIER,
        current_resolved_at=None,
        current_reopen_count=0,
        new_status="resolved",
        now=NOW,
    )
    assert result.status == "resolved"
    assert result.mitigated_at == EARLIER
    assert result.resolved_at == NOW
    assert result.reopen_count == 0


def test_resolved_to_open_clears_both_timestamps_and_increments_reopen_count() -> None:
    result = apply_transition(
        current_status="resolved",
        current_mitigated_at=EARLIER,
        current_resolved_at=EARLIER,
        current_reopen_count=0,
        new_status="open",
        now=NOW,
    )
    assert result.status == "open"
    assert result.mitigated_at is None
    assert result.resolved_at is None
    assert result.reopen_count == 1


def test_mitigated_to_open_clears_mitigated_at_and_increments_reopen_count() -> None:
    result = apply_transition(
        current_status="mitigated",
        current_mitigated_at=EARLIER,
        current_resolved_at=None,
        current_reopen_count=0,
        new_status="open",
        now=NOW,
    )
    assert result.status == "open"
    assert result.mitigated_at is None
    assert result.resolved_at is None
    assert result.reopen_count == 1


def test_reopen_count_accumulates_across_multiple_reopen_cycles() -> None:
    result = apply_transition(
        current_status="resolved",
        current_mitigated_at=EARLIER,
        current_resolved_at=EARLIER,
        current_reopen_count=2,
        new_status="open",
        now=NOW,
    )
    assert result.reopen_count == 3


@pytest.mark.parametrize("status", ALL_STATUSES)
def test_same_to_same_is_a_noop(status: str) -> None:
    mitigated_at = EARLIER if status in ("mitigated", "resolved") else None
    resolved_at = EARLIER if status == "resolved" else None
    result = apply_transition(
        current_status=status,
        current_mitigated_at=mitigated_at,
        current_resolved_at=resolved_at,
        current_reopen_count=1,
        new_status=status,
        now=NOW,
    )
    assert result.status == status
    assert result.mitigated_at == mitigated_at
    assert result.resolved_at == resolved_at
    assert result.reopen_count == 1


def test_resolved_to_mitigated_is_invalid() -> None:
    with pytest.raises(InvalidTransitionError) as exc_info:
        apply_transition(
            current_status="resolved",
            current_mitigated_at=EARLIER,
            current_resolved_at=EARLIER,
            current_reopen_count=0,
            new_status="mitigated",
            now=NOW,
        )
    assert exc_info.value.from_status == "resolved"
    assert exc_info.value.to_status == "mitigated"
