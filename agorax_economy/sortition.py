"""
AgoraX Economy — Sortition Engine

Verifiable random selection of citizens for deliberation panels.
Anyone can check that the selection was fair using the published
seed and proof.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Protocol


class InsufficientPoolError(Exception):
    """Raised when the eligible pool is smaller than the requested panel."""
    pass


class SortitionWarning(UserWarning):
    """Warns when pool is small relative to panel size."""
    pass


def _deterministic_shuffle(indices: list[int], seed_bytes: bytes) -> list[int]:
    """
    Deterministic Fisher-Yates shuffle seeded by iterative SHA-256 hashing.

    Given the same seed, always produces the same permutation.
    This is what makes verification possible.
    """
    shuffled = indices[:]
    n = len(shuffled)

    for i in range(n - 1, 0, -1):
        # Generate a random index using iterative SHA-256
        hash_input = seed_bytes + i.to_bytes(8, "big")
        digest = hashlib.sha256(hash_input).digest()
        rand_int = int.from_bytes(digest[:4], "big")
        j = rand_int % (i + 1)

        # Swap
        shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

    return shuffled


def select_panel(
    pool: list[str],
    panel_size: int,
    deliberation_id: str,
    external_entropy: bytes | None = None,
) -> tuple[list[str], str, str]:
    """
    Select a random panel of citizens from the eligible pool.

    Args:
        pool: List of citizen IDs eligible for selection.
        panel_size: Number of citizens to select.
        deliberation_id: UUID string of the deliberation.
        external_entropy: Optional external randomness (e.g., DRAND beacon).

    Returns:
        (selected_citizen_ids, seed_hex, proof_hex)

    Raises:
        InsufficientPoolError: If pool < panel_size.
    """
    pool_size = len(pool)

    if pool_size < panel_size:
        raise InsufficientPoolError(
            f"Pool size ({pool_size}) is less than requested panel size ({panel_size}). "
            f"Need at least {panel_size} verified citizens."
        )

    # Warn if pool is small relative to panel
    if pool_size < 3 * panel_size:
        import warnings
        warnings.warn(
            SortitionWarning(
                f"Pool size ({pool_size}) is less than 3x panel size ({panel_size}). "
                f"Randomness may be limited."
            )
        )

    # Generate 256-bit random seed
    raw_seed = secrets.token_bytes(64)
    seed_hash = hashlib.sha256(raw_seed).digest()

    # Mix in external entropy if provided
    if external_entropy:
        seed_hash = hashlib.sha256(seed_hash + external_entropy).digest()

    seed_hex = seed_hash.hex()

    # Create HMAC proof
    message = f"{deliberation_id}:{pool_size}:{panel_size}"
    proof = hmac.new(seed_hash, message.encode("utf-8"), hashlib.sha256).digest()
    proof_hex = proof.hex()

    # Deterministic shuffle
    indices = list(range(pool_size))
    shuffled = _deterministic_shuffle(indices, seed_hash)

    # Select first panel_size indices
    selected_indices = shuffled[:panel_size]
    selected = [pool[idx] for idx in sorted(selected_indices)]

    return selected, seed_hex, proof_hex


def verify_selection(
    seed_hex: str,
    proof_hex: str,
    deliberation_id: str,
    pool_size: int,
    panel_size: int,
) -> tuple[bool, list[int]]:
    """
    Verify that a sortition selection was fair.

    Recomputes the HMAC proof and selection from the published seed.
    Anyone can call this with the published seed and proof to confirm
    the panel was fairly chosen.

    Args:
        seed_hex: The published sortition seed (hex string).
        proof_hex: The published HMAC proof (hex string).
        deliberation_id: UUID string of the deliberation.
        pool_size: Size of the eligible pool at selection time.
        panel_size: Number of citizens selected.

    Returns:
        (is_valid, selected_indices)
    """
    try:
        seed_bytes = bytes.fromhex(seed_hex)
        expected_proof = bytes.fromhex(proof_hex)
    except ValueError:
        return False, []

    # Recompute HMAC
    message = f"{deliberation_id}:{pool_size}:{panel_size}"
    recomputed_proof = hmac.new(
        seed_bytes, message.encode("utf-8"), hashlib.sha256
    ).digest()

    # Timing-safe comparison
    proof_valid = hmac.compare_digest(expected_proof, recomputed_proof)

    if not proof_valid:
        return False, []

    # Recompute selection
    indices = list(range(pool_size))
    shuffled = _deterministic_shuffle(indices, seed_bytes)
    selected_indices = sorted(shuffled[:panel_size])

    return True, selected_indices
