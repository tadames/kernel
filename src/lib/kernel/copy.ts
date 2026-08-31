export const LAWS = [
  {
    id: "01",
    title: "A mind is a loop, not a creature",
    body: "Intelligence is a process that gets less wrong. The kernel is six operations on a stream: observe, predict, measure surprise, compress, record whether compression improved, act. A grid forager is one body for that loop. A bit stream is another. If the loop cannot leave the body it was born in, it was never a kernel.",
  },
  {
    id: "02",
    title: "Prediction is compression",
    body: "To predict a stream you must find its regularities. Finding regularities is data compression. Hutter’s AIXI makes the ceiling precise: the optimal agent’s world-model is the shortest program that would have produced the observations so far. It is incomputable. Every working mind is an approximation of that ceiling. This one uses gradient descent on a tiny network because that is a compressor you can watch.",
  },
  {
    id: "03",
    title: "Surprise is the training signal — measured before the update",
    body: "Friston’s free-energy principle and predictive coding: keep a generative model, update it when the world disagrees. Surprise is not a mood. It is the residual of the current model. This kernel records δ before the gradient step. Training after that is compression. A demo that reports post-update error is flattering itself.",
  },
  {
    id: "04",
    title: "Curiosity is compression progress, not novelty",
    body: "Raw surprise is a trap. Noise is infinitely surprising and infinitely useless. Schmidhuber’s rule is sharper: reward the derivative — how much better the model just became. The intrinsic term is primarily the model’s own expected residual (uncertainty in the predicted window), mixed lightly with visit-scent, scaled by recent progress ρ, and further by an action-conditional residual drop across horizon-2 imagination (ρ̂). A second loop on hidden activations remains Phase 1. The Bench view is the test: the same loop compresses a repeating bit stream and refuses a fair coin.",
  },
  {
    id: "05",
    title: "Action is imagined, not scripted",
    body: "A model that cannot act is a spectator. A policy that cannot model is a reflex. The body may use what it already sees in the destination cell — that is sensing. It may not scan the window for food in a half-plane — that is a script. The kernel imagines each move, then a second step from the predicted window (horizon 2, discounted, confidence-gated). Early on the model is uncalibrated, so sensors dominate. Later the guess starts to matter.",
  },
  {
    id: "06",
    title: "It must be public, and it must be falsifiable",
    body: "A kernel that only runs behind an API is a product. One that cannot fail a test is a story. The claims live in the Bench: surprise falls on structure, not on noise; wall bumps fall as the model forms; the same Loop object drives two worlds. If a claim fails, the journal records it. Intelligence should be a commons. The means of mind are the loop, the tests, and the right to see them break.",
  },
  {
    id: "07",
    title: "Complexity grows where the stream compresses; action lives between freeze and noise",
    body: "A mind that cannot grow is a fit, not a life. We do not grow the net yet (Phase 3). We track effective complexity: commitment — how far predictions have left ½ — must rise on a regularity and stay low on a coin. That is Crutchfield’s peak between order and randomness, written as a number. Action is the same strip: branching of imagined moves must not collapse to 1 (frozen) or 5 (a coin). The useful band is the edge of chaos, where a small observation can still flip the next act. Law 04 is the scalar (ρ). This is the spectrum. If either claim fails, we are not growing, we are wandering or stuck.",
  },
] as const;

export const PHASES = [
  {
    id: "0",
    title: "Seed",
    now: true,
    body: "A domain-general loop, a compressor, one-step imagination, two testbeds (grid + next-bit stream), falsifiable claims. This repository.",
  },
  {
    id: "1",
    title: "Hierarchy",
    now: false,
    body: "Predict in a latent space, not in cells. A second kernel whose observations are the first kernel’s hidden state — the JEPA move, and what cortex already does. Also: a model of learning, so curiosity can be action-conditional ρ̂ rather than novelty × recent ρ.",
  },
  {
    id: "2",
    title: "Language",
    now: false,
    body: "Treat language as a compression of experience, not a replacement for it. A small vocabulary grounded in what this agent has actually seen and done.",
  },
  {
    id: "3",
    title: "Self-revision",
    now: false,
    body: "The learning rules become part of the world the kernel can model. It may change its own rate, curiosity, even shape, under the same pressure: reduce surprise, keep energy, keep going. That is when complexity is allowed to grow in the architecture, not only in the predictions.",
  },
  {
    id: "4",
    title: "Commons",
    now: false,
    body: "The seed runs on a phone. Anyone can fork the loop. No gatekeepers on the means of mind.",
  },
] as const;

export const STAGES = [
  {
    id: "observe",
    code: "x ← sense(world)",
    name: "Observe",
    note: "Whatever the testbed provides. On the grid: a 5×5 window of walls, food, visit-scent. On the stream: the last eight bits. No coordinates. No map. The kernel does not know which world it is in.",
  },
  {
    id: "predict",
    code: "x̂ ← M(x₋, a₋)",
    name: "Predict",
    note: "The compressor guesses the next observation from the last observation and the last action. Same object on every testbed. Only the sizes change.",
  },
  {
    id: "surprise",
    code: "δ ← ‖x − x̂‖²",
    name: "Surprise",
    note: "The residual of the current model, before the update. When this number falls, the model is compressing the world. When it stays high, the world is incompressible or the model is too small.",
  },
  {
    id: "compress",
    code: "M ← M − η ∇δ",
    name: "Compress",
    note: "Gradient descent on that error, plus a short replay of recent experience. Learning is making the next guess cheaper to write.",
  },
  {
    id: "progress",
    code: "ρ ← δ̄ − δ",
    name: "Progress",
    note: "Not surprise itself — the improvement. This is curiosity’s true signal. Noise does not pay. Structure does. Action-conditional ρ̂ is still an open problem (Phase 1).",
  },
  {
    id: "act",
    code: "a ← π(M, ρ, goal)",
    name: "Act",
    note: "Imagine every legal move, then the best follow-up from the predicted window (horizon 2). Read whiskers on step 1 and pure model on step 2. Residual drop step-1→step-2 is action-conditional ρ̂ for curiosity. Sample. No half-plane scan for food. Branching of those scores is the cheap edge-of-chaos trace: not 1, not 5.",
  },
] as const;
