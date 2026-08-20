"""
Pytest bootstrap for the Ballot Validation Service.

Sets a dummy SALT_KEY before `config.Settings` is instantiated so the test
suite can import the module. Production deployments must supply a real
SALT_KEY via env (no in-code default) — see GDPR data-minimisation audit
(docs/compliance/03_OPERATIONAL_AUDITS.md §1).
"""
import os

os.environ.setdefault("SALT_KEY", "test-only-salt-not-for-production-use")
