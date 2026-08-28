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
    body: "Raw surprise is a trap. Noise is infinitely surprising and infinitely useless. Schmidhuber’s rule is sharper: reward the derivative — how much better the model just became. The policy now scores actions by novelty, expected residual (how much the model thinks the view will change), and recent compression progress (falling EMA surprise). Absolute surprise is no longer a reward. A scientist is an agent whose goal is to improve the model.",
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
    title: "Multi-agent",
    now: false,
    body: "Two kernels in one world. Communication only through the shared environment at first, then through a thin channel of symbols they invent.",
  },
] as const;

export const LOOP_STEPS = [
  { id: "observe", label: "Observe", detail: "5×5 local view · wall / food / scent" },
  { id: "predict", label: "Predict", detail: "MLP imagines the next view for each action" },
  { id: "surprise", label: "Surprise", detail: "MSE(pred, actual) is the training signal" },
  { id: "compress", label: "Compress", detail: "Online SGD + small replay · weights move" },
  { id: "progress", label: "Progress", detail: "Falling EMA surprise · the derivative" },
  { id: "act", label: "Act", detail: "Curiosity + goal − walls · energy body" },
] as const;
