#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run check:i18n
npm run test:unit

if [ -d ballot_service/tests ]; then
  missing_python_deps=0
  for package in pytest pypdf pyhanko sqlalchemy pydantic_settings; do
    if ! python - <<PY >/dev/null 2>&1
import ${package}
PY
    then
      missing_python_deps=1
      break
    fi
  done

  if [ "$missing_python_deps" -eq 0 ]; then
    (cd ballot_service && python -m pytest tests/ -q)
  else
    echo "Skipping ballot_service Python tests; install dependencies with:" >&2
    echo "  cd ballot_service && python -m pip install -r requirements.txt pytest" >&2
  fi
fi
