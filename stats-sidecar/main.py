#!/usr/bin/env python3
"""AgoraX stats sidecar — raking service.

Optional companion to server/stats/raking.ts. The Node app POSTs the same
payload here when STATS_SIDECAR_URL is set; any failure falls back to the
in-process TypeScript engine, so this service is never load-bearing.

Deliberately stdlib-only (no FastAPI/numpy) so it runs on any Python 3.9+
box with zero installs. This is the seam where the MRP upgrade lands later:
swap the IPF below for a Stan/brms call without touching the Node side.

Run:  python3 stats-sidecar/main.py            (port 8077)
      STATS_SIDECAR_PORT=9000 python3 stats-sidecar/main.py

Contract:  POST /rake
  in:  { rows: [{key, strata: {var: cat}}], variables: [..],
         margins: {var: {cat: share}}, weightMin, weightMax }
  out: { weights: {key: w}, effectiveN, designEffect, variablesUsed,
         variablesDropped, trimmedCount, iterations, converged }
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

MAX_ITER = 100
TOLERANCE = 1e-6


def usable_margin(target, sample_cats):
    present = {c: s for c, s in target.items() if c in sample_cats}
    if len(present) < 2:
        return None
    total = sum(present.values())
    return {c: s / total for c, s in present.items()}


def rake(rows, variables, margins, weight_min, weight_max):
    n = len(rows)
    used, dropped, active = [], [], []
    for var in variables:
        target = margins.get(var)
        if not target:
            dropped.append(var)
            continue
        sample_cats = {r["strata"].get(var) for r in rows} - {None}
        margin = usable_margin(target, sample_cats)
        if margin is None:
            dropped.append(var)
            continue
        used.append(var)
        active.append((var, margin))

    weights = [1.0] * n
    iterations = 0
    converged = not active
    for it in range(MAX_ITER):
        if converged:
            break
        iterations = it + 1
        max_shift = 0.0
        for var, margin in active:
            totals, grand = {}, 0.0
            for i, r in enumerate(rows):
                cat = r["strata"].get(var)
                if cat in margin:
                    totals[cat] = totals.get(cat, 0.0) + weights[i]
                    grand += weights[i]
            for i, r in enumerate(rows):
                cat = r["strata"].get(var)
                if cat in margin and totals.get(cat, 0.0) > 0:
                    factor = margin[cat] * grand / totals[cat]
                    max_shift = max(max_shift, abs(factor - 1.0))
                    weights[i] *= factor
        if max_shift < TOLERANCE:
            converged = True

    trimmed = 0
    for i, w in enumerate(weights):
        if w < weight_min:
            weights[i] = weight_min
            trimmed += 1
        elif w > weight_max:
            weights[i] = weight_max
            trimmed += 1
    mean = sum(weights) / max(1, n)
    weights = [w / mean for w in weights]

    s, ss = sum(weights), sum(w * w for w in weights)
    effective_n = (s * s) / ss if ss else 0.0
    return {
        "weights": {str(r["key"]): weights[i] for i, r in enumerate(rows)},
        "effectiveN": effective_n,
        "designEffect": (n / effective_n) if effective_n else 1.0,
        "variablesUsed": used,
        "variablesDropped": dropped,
        "trimmedCount": trimmed,
        "iterations": iterations,
        "converged": converged,
    }


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "engine": "python-sidecar"})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/rake":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length))
            result = rake(
                req["rows"],
                req["variables"],
                req["margins"],
                float(req.get("weightMin", 0.3)),
                float(req.get("weightMax", 3.0)),
            )
            return self._json(200, result)
        except Exception as exc:  # noqa: BLE001 — report, fallback is Node-side
            return self._json(400, {"error": str(exc)})

    def log_message(self, *args):  # quiet
        pass


if __name__ == "__main__":
    port = int(os.environ.get("STATS_SIDECAR_PORT", "8077"))
    print(f"agorax stats sidecar listening on :{port}")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
