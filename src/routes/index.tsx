import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { FieldStage } from "@/components/field-stage";
import { StudioDock } from "@/components/studio-dock";
import { audioEngine } from "@/lib/audio-engine";
import { bindStudioAudio } from "@/lib/performance";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  useEffect(() => {
    const unlock = () => audioEngine.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const unbind = bindStudioAudio();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      unbind();
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg select-none">
      <FieldStage />
      <StudioDock />
    </main>
  );
}
