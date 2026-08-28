import { BenchView } from "@/components/bench-view";
import { Controls } from "@/components/controls";
import { IntroOverlay } from "@/components/intro-overlay";
import { LawsView } from "@/components/laws-view";
import { LoopView } from "@/components/loop-view";
import { MindPanel } from "@/components/mind-panel";
import { WorldCanvas } from "@/components/world-canvas";
import { useLab, type ViewId } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "lab", label: "Lab" },
  { id: "bench", label: "Bench" },
  { id: "laws", label: "Laws" },
  { id: "loop", label: "Loop" },
];

export function AppShell() {
  const boot = useLab((s) => s.boot);
  const ready = useLab((s) => s.ready);
  const view = useLab((s) => s.view);
  const setView = useLab((s) => s.setView);
  const snap = useLab((s) => s.snap);
  const intro = useLab((s) => s.intro);
  const play = useLab((s) => s.play);
  const stepOnce = useLab((s) => s.stepOnce);
  const resetBrain = useLab((s) => s.resetBrain);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        play();
      } else if (e.key === "n" || e.key === "N") {
        stepOnce();
      } else if (e.key === "r" || e.key === "R") {
        resetBrain();
      } else if (e.key === "1") setView("lab");
      else if (e.key === "2") setView("bench");
      else if (e.key === "3") setView("laws");
      else if (e.key === "4") setView("loop");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, stepOnce, resetBrain, setView]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="font-display text-2xl italic leading-none tracking-[-0.03em]">Kernel</div>
            <div className="mt-1 hidden text-xs text-muted sm:block">a loop that can leave its body</div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Views">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "h-11 rounded-full px-3 text-sm transition-colors sm:px-4",
                  view === v.id ? "bg-fg text-accent-fg" : "text-muted hover:text-fg",
                )}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {!ready || !snap ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="aspect-square rounded-[var(--radius-xl)] bg-surface" />
            <div className="h-80 rounded-[var(--radius-xl)] bg-surface" />
          </div>
        ) : view === "lab" ? (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section className="min-w-0">
              <div className="relative aspect-square overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface">
                <WorldCanvas snap={snap} />
              </div>
              <div className="mt-6 rounded-[var(--radius-xl)] border border-line bg-surface p-5 sm:p-6">
                <Controls />
              </div>
            </section>
            <section className="min-w-0">
              <MindPanel snap={snap} />
            </section>
          </div>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0">
              {view === "laws" ? <LawsView /> : view === "bench" ? <BenchView /> : <LoopView snap={snap} />}
            </div>
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <div className="relative aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
                <WorldCanvas snap={snap} interactive={false} />
              </div>
              <p className="mt-3 font-display text-lg italic leading-snug text-muted">{snap.thought}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
                still running
              </p>
            </aside>
          </div>
        )}
      </main>

      {intro && ready ? <IntroOverlay /> : null}
    </div>
  );
}
