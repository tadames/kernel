# Kernel journal

Daily log of what changed, what was learned, next hypothesis.

## 2026-08-31 — Brain resume carries learning state

One change: finish the incomplete save/load wiring and make a resumed mind continuous.

Prior commits added MLP.exportWeights / importWeights and Loop helpers, but Kernel.saveBrain / loadBrain were never attached — the round-trip test failed with "not a function". Fixed that. The brain snapshot now also carries ema, progressEma, surprise, progress, and a truncated replay (cap 48). Weight-only snapshots still load for backward compatibility. Body and world stay untouched so a mind can wake in a new room without a teacher.

Why: without ema a loaded mind looks maximally surprised again and curiosity thrashes. Replay keeps the short online memory that stabilizes compression. This closes the thrash hypothesis from the previous entry without opening Phase 1.

G1–C2 still pass. Kernel tests (11) pass, including the strengthened round-trip (ema restored exactly, replay non-empty, weight-only path still works). Typecheck clean. Production build clean. Dev Lab loads on :8080 with live surprise/compression.

Evidence: node --experimental-strip-types --test src/lib/kernel/kernel.test.ts — 11/11.

Next hypothesis: true action-conditional ρ̂ via a second Loop on hidden activations (Phase 1), or latent prediction so the compressor is not forced to reconstruct every cell. If a mind loaded into a *different* worldKind still shows a lasting ema spike after the first 30 steps, the replay from the old world is harmful and should be dropped on world change.
