"use client";

import { useState } from "react";

import { BriefComposer } from "@/components/research/brief-composer";
import { RunsLibrary } from "@/components/research/runs-library";

export function Desk() {
  const [question, setQuestion] = useState("");
  return (
    <div className="flex flex-col gap-12">
      <BriefComposer question={question} onQuestionChange={setQuestion} />
      <RunsLibrary onPickExample={setQuestion} />
    </div>
  );
}
