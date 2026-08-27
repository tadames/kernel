import { Button } from "@/components/ui/button";
import { useLab } from "@/lib/lab-store";

export function IntroOverlay() {
  const dismiss = useLab((s) => s.dismissIntro);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="kernel-intro-title"
        className="w-full max-w-lg rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">Kernel</p>
        <h2 id="kernel-intro-title" className="font-display mt-3 text-3xl leading-tight tracking-[-0.03em]">
          You are watching a mind with no prior knowledge.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted">
          It will be clumsy. Then it will not. The only thing it does is guess the next moment, measure the
          error, rewrite itself, and move toward whatever still teaches it. That loop is the kernel.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="solid" size="md" onClick={dismiss}>
            Watch it learn
          </Button>
        </div>
      </div>
    </div>
  );
}
