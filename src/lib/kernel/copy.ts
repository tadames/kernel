export const LAWS = [
  {
    id: "01",
    title: "A mind is a loop",
    body: "Intelligence is not a pile of parameters. It is a process that gets less wrong. The oldest useful statement of that process is older than computers: guess what happens next, notice the error, change so the next guess is better, and move toward the places where the error still teaches you something.",
  },
  {
    id: "02",
    title: "Prediction is compression",
    body: "To predict a stream you must find its regularities. Finding regularities is exactly data compression. Hutter’s AIXI makes this precise: the optimal agent is the one whose world-model is the shortest program that would have produced the observations so far, then acts to maximise reward in that model. It is incomputable. It is still the ceiling. Every working mind is an approximation of that ceiling.",
  },
  {
    id: "03",
    title: "Surprise is the training signal",
    body: "Friston’s free-energy principle and predictive coding say the same thing in the language of brains: keep a generative model of the world, and update it when the world disagrees. Surprise is not a mood. It is the gradient. This kernel trains a tiny network on one quantity — the squared difference between the next local view and what the model expected.",
  },
  {
    id: "04",
    title: "Curiosity is compression progress",
    body: "Raw surprise is a trap. Noise is infinitely surprising and infinitely useless. Schmidhuber’s rule is sharper: reward the derivative — how much better the model just became. In this lab, novelty (unvisited scent) stands in for expected learning, and a falling surprise curve is the visible proof. A scientist is an agent whose goal is to improve the model.",
  },
  {
    id: "05",
    title: "Action closes the loop",
    body: "A model that cannot act is a spectator. A policy that cannot model is a reflex. The kernel imagines each move, discounts walls it has learned to see, walks toward food when energy is scarce, and otherwise seeks the less familiar edge. Sutton’s bitter lesson still holds: search plus learning, scaled, beats hand-built knowledge. Here the search is five imagined steps. The learning is every tick.",
  },
  {
    id: "06",
    title: "It must be public",
    body: "A kernel that only runs behind an API is a product, not a commons. This one lives in the browser. No account. No key. You can watch every weight move. The point of the work is not a smarter assistant. It is to put the means of intelligence — the loop itself — where writing already is: with everyone.",
  },
] as const;

export const PHASES = [
  {
    id: "0",
    title: "Seed",
    now: true,
    body: "A local world model, online gradient compression, curiosity, a body with energy. Everything inspectable. This lab.",
  },
  {
    id: "1",
    title: "Hierarchy",
    now: false,
    body: "Predict in a latent space, not in cells. A second kernel whose observations are the first kernel’s hidden state — the JEPA move, and what cortex already does.",
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
    body: "The learning rules become part of the world the kernel can model. It may change its own rate, curiosity, even shape, under the same pressure: reduce surprise, keep energy, keep going.",
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
    note: "A 5×5 window: walls, food, and a decaying scent of where the body has been. No coordinates. No map. Only what is here.",
  },
  {
    id: "predict",
    code: "x̂ ← M(x₋, a₋)",
    name: "Predict",
    note: "A two-layer network, a few thousand weights, guesses the next window from the last window and the last move.",
  },
  {
    id: "surprise",
    code: "δ ← ‖x − x̂‖²",
    name: "Surprise",
    note: "The only loss. When this number falls, the model is compressing the world. When it spikes, the world changed or the model was wrong.",
  },
  {
    id: "compress",
    code: "M ← M − η ∇δ",
    name: "Compress",
    note: "Gradient descent on that error, plus a short replay of recent experience. Learning is just making the next guess cheaper to write.",
  },
  {
    id: "progress",
    code: "ρ ← δ̄ − δ",
    name: "Progress",
    note: "Not surprise itself — the improvement. This is curiosity’s true signal. Noise does not pay. Structure does.",
  },
  {
    id: "act",
    code: "a ← π(curiosity, goal, M)",
    name: "Act",
    note: "Imagine five moves. Avoid predicted walls. Seek food when hungry. Otherwise walk toward low scent. Sample, do not freeze.",
  },
] as const;
