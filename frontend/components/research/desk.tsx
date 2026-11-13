"use client";

import { useState } from "react";

import { BriefComposer } from "@/components/research/brief-composer";

export function Desk() {
  const [question, setQuestion] = useState("");
  return (
    <div className="my-auto flex flex-col gap-12 py-8">
      <BriefComposer question={question} onQuestionChange={setQuestion} />
    </div>
  );
}
