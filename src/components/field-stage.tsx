import { useEffect } from "react";
import { FieldCanvas } from "@/components/field-canvas";
import { TopField } from "@/components/top-field";
import { useStudio } from "@/lib/studio-store";

function Caption({ children, className }: { children: string; className: string }) {
  return (
    <p className={`pointer-events-none absolute z-10 text-xs font-medium tracking-wide text-muted ${className}`}>
      {children}
    </p>
  );
}

function exportComposite(seed: number, view: "both" | "top") {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#090a0c";
  ctx.fillRect(0, 0, w, h);
  const paint = (el: HTMLCanvasElement | null) => {
    if (!el || el.width < 2 || el.height < 2) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    ctx.drawImage(el, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
  };
  paint(document.querySelector("canvas[data-sonora='top']"));
  if (view === "both") paint(document.querySelector("canvas[data-sonora='side']"));
  const a = document.createElement("a");
  a.download = `sonora-${seed}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
}

export function FieldStage() {
  const view = useStudio((s) => s.view);
  const topInset = useStudio((s) => s.topInset);
  const bottomInset = useStudio((s) => s.bottomInset);

  useEffect(() => {
    let last = useStudio.getState().exportRequest;
    return useStudio.subscribe((s) => {
      if (s.exportRequest === last) return;
      last = s.exportRequest;
      if (s.view === "side") return;
      exportComposite(s.seed, s.view);
    });
  }, []);

  if (view === "side") return <FieldCanvas />;

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ paddingTop: topInset, paddingBottom: bottomInset }}
    >
      <div className={`relative min-h-36 ${view === "both" ? "flex-[5]" : "min-h-0 flex-1"}`}>
        <TopField />
        <Caption className="bottom-2 left-4">Plate</Caption>
      </div>
      {view === "both" ? (
        <div className="relative min-h-0 flex-[6] border-t border-line">
          <FieldCanvas contained />
          <Caption className="top-2 left-4">Side</Caption>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden>
          <FieldCanvas />
        </div>
      )}
    </div>
  );
}
