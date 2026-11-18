"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const QUESTIONS = [
  "What are the main approaches to recycling EV batteries?",
  "How effective are four-day work weeks, based on recent pilots?",
  "Where is solid-state battery commercialisation today?",
];
const STAGES = ["Brief", "Plan", "Research", "Writing", "Report"];
const SOURCES = [
  { domain: "nature.com", title: "Direct recycling keeps cathode structure intact", delay: "0s" },
  { domain: "iea.org", title: "Global EV outlook: battery supply chains", delay: "1.2s" },
  { domain: "sciencedirect.com", title: "Hydrometallurgy versus pyrometallurgy", delay: "2.4s" },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Types each question in turn, holds it, erases it, and moves to the next. */
function useTypewriter(reduced: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let q = 0;
    let i = 0;
    let erasing = false;
    const tick = () => {
      if (cancelled) return;
      const full = QUESTIONS[q];
      if (!erasing) {
        i += 1;
        setText(full.slice(0, i));
        if (i === full.length) {
          erasing = true;
          timer = setTimeout(tick, 2200);
          return;
        }
        timer = setTimeout(tick, 38);
      } else {
        i -= 2;
        setText(full.slice(0, Math.max(i, 0)));
        if (i <= 0) {
          erasing = false;
          i = 0;
          q = (q + 1) % QUESTIONS.length;
          timer = setTimeout(tick, 400);
          return;
        }
        timer = setTimeout(tick, 14);
      }
    };
    timer = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduced]);
  return reduced ? QUESTIONS[0] : text;
}

/** Decorative demo of a run: a question being typed, the five stages ticking, sources drifting in. */
export function AuthShowcase() {
  const reduced = useReducedMotion();
  const text = useTypewriter(reduced);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStage((s) => (s + 1) % (STAGES.length + 1)), 1800);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <p className="min-h-12 text-base">
          {text}
          <span className="animate-caret ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-foreground" />
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Quick
          </span>
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            ↑
          </span>
        </div>
      </div>

      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
        {STAGES.map((label, index) => {
          const done = index < stage;
          const current = index === stage;
          return (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border transition-colors duration-300",
                  done && "border-brand bg-brand text-background",
                  current && "animate-stage-pulse border-brand",
                  !done && !current && "border-border",
                )}
              >
                {done && <Check className="size-3" />}
              </span>
              <span className={cn(current ? "font-medium" : "text-muted-foreground")}>{label}</span>
              {index < STAGES.length - 1 && <span className="h-px w-3 bg-border" />}
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-col gap-2">
        {SOURCES.map((s, i) => (
          <li
            key={s.domain}
            style={{ animationDelay: s.delay, marginLeft: `${i * 20}px` }}
            className="animate-float rounded-2xl border border-border bg-card px-3 py-2"
          >
            <span className="font-mono text-xs text-muted-foreground">{s.domain}</span>
            <span className="block text-sm">{s.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
