"""Tests for Sortition Engine — deterministic, verifiable selection."""

import pytest
from agorax_economy.sortition import (
    select_panel,
    verify_selection,
    InsufficientPoolError,
    _deterministic_shuffle,
)


def test_deterministic_shuffle_same_seed():
    """Same seed → same permutation."""
    seed = b"test_seed_123456789012345678901234567890"
    indices = list(range(100))

    result1 = _deterministic_shuffle(indices, seed)
    result2 = _deterministic_shuffle(indices, seed)

    assert result1 == result2


def test_deterministic_shuffle_different_seed():
    """Different seed → different permutation."""
    seed1 = b"seed_one_123456789012345678901234567890"
    seed2 = b"seed_two_123456789012345678901234567890"
    indices = list(range(100))

    result1 = _deterministic_shuffle(indices, seed1)
    result2 = _deterministic_shuffle(indices, seed2)

    assert result1 != result2


def test_select_panel_basic():
    """Select panel returns correct number of participants."""
    pool = [f"citizen_{i}" for i in range(100)]
    selected, seed, proof = select_panel(pool, 15, "delib_001")

    assert len(selected) == 15
    assert all(c in pool for c in selected)
    assert len(seed) == 64  # SHA-256 hex = 64 chars
    assert len(proof) == 64  # HMAC-SHA256 hex = 64 chars


def test_select_panel_insufficient_pool():
    """Insufficient pool raises InsufficientPoolError."""
    pool = [f"citizen_{i}" for i in range(5)]

    with pytest.raises(InsufficientPoolError):
        select_panel(pool, 10, "delib_002")


def test_verify_selection_valid():
    """Valid seed + proof passes verification."""
    pool = [f"citizen_{i}" for i in range(100)]
    selected, seed, proof = select_panel(pool, 15, "delib_003")

    is_valid, indices = verify_selection(seed, proof, "delib_003", 100, 15)

    assert is_valid is True
    assert len(indices) == 15


def test_verify_selection_tampered_seed():
    """Tampered seed fails verification."""
    pool = [f"citizen_{i}" for i in range(100)]
    _, seed, proof = select_panel(pool, 15, "delib_004")

    # Tamper with the seed
    tampered_seed = seed[:-1] + ("0" if seed[-1] != "0" else "1")

    is_valid, indices = verify_selection(tampered_seed, proof, "delib_004", 100, 15)

    assert is_valid is False


def test_verify_selection_wrong_deliberation():
    """Wrong deliberation ID fails verification."""
    pool = [f"citizen_{i}" for i in range(100)]
    _, seed, proof = select_panel(pool, 15, "delib_005")

    is_valid, _ = verify_selection(seed, proof, "wrong_delib", 100, 15)

    assert is_valid is False


def test_verify_selection_recomputes_same_indices():
    """Verification recomputes the same selection indices."""
    pool = [f"citizen_{i}" for i in range(100)]
    selected, seed, proof = select_panel(pool, 20, "delib_006")

    is_valid, indices = verify_selection(seed, proof, "delib_006", 100, 20)

    assert is_valid is True
    # The indices should correspond to the selected citizens
    selected_indices = sorted(pool.index(c) for c in selected)
    assert indices == selected_indices
