import asyncio
import itertools
import json
import re
from collections.abc import Iterator
from typing import Any, Literal

from groq import RateLimitError
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.runnables import Runnable
from pydantic import BaseModel, SecretStr, ValidationError

from app.agents.budget import current_budget
from app.core.config import settings

Kind = Literal["strong", "fast"]


LLM = Runnable[Any, BaseMessage]
_key_cursor = itertools.count()


def _groq_model(kind: Kind, api_key: str, max_retries: int) -> BaseChatModel:
    from langchain_groq import ChatGroq  # imported here so no other module touches ChatGroq

    # max_retries: the Groq SDK retries 429 and 5xx with exponential backoff.
    return ChatGroq(
        model=settings.groq_strong_model if kind == "strong" else settings.groq_fast_model,
        api_key=SecretStr(api_key),
        temperature=0.2,
        max_retries=max_retries,
        timeout=60,
    )


def get_llm(kind: Kind) -> LLM:
    """The only place chat models are created.

    With several Groq keys, calls start on a rotating key and fall back to the others on a
    rate limit (429), so parallel research branches share the load.
    """
    if settings.llm_provider == "fake":
        return FakeChatModel()
    keys = settings.groq_keys
    if not keys:
        raise RuntimeError("No Groq API key configured (set GROQ_API_KEY or GROQ_API_KEYS)")
    if len(keys) == 1:
        return _groq_model(kind, keys[0], max_retries=3)
    start = next(_key_cursor) % len(keys)
    ordered = keys[start:] + keys[:start]
    # Fail over quickly: one SDK retry per key, then move on to the next key.
    models = [_groq_model(kind, k, max_retries=1) for k in ordered]
    return models[0].with_fallbacks(models[1:], exceptions_to_handle=(RateLimitError,))


class StructuredOutputError(Exception):
    pass


def _extract_json(text: str) -> Any:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start : end + 1])


async def invoke_structured[T: BaseModel](
    llm: LLM, schema: type[T], messages: list[BaseMessage], attempts: int = 2
) -> T:
    """Call the model, parse its JSON reply into `schema`; retry once, then fail cleanly."""
    last_error: Exception | None = None
    convo = list(messages)
    for _ in range(attempts):
        reply = await llm.ainvoke(convo)
        usage = getattr(reply, "usage_metadata", None)
        budget = current_budget.get()
        if budget is not None and usage:
            budget.add(int(usage.get("total_tokens", 0)))
        text = reply.content if isinstance(reply.content, str) else str(reply.content)
        try:
            return schema.model_validate(_extract_json(text))
        except (ValueError, ValidationError) as exc:
            last_error = exc
            convo = [
                *messages,
                HumanMessage(
                    content="Your last reply was not valid JSON for the requested shape. "
                    "Reply with only the JSON object."
                ),
            ]
    raise StructuredOutputError(f"The model returned an unusable answer: {last_error}")


class FakeChatModel(BaseChatModel):
    """Scripted model for tests and phase gates. Picks its answer from a `[task:x]` tag."""

    @property
    def _llm_type(self) -> str:
        return "scholar-fake"

    def _answer(self, messages: list[BaseMessage]) -> AIMessage:
        text = "\n".join(str(m.content) for m in messages)
        if "[task:planner]" in text:
            payload = _fake_plan(text)
        elif "[task:reader]" in text:
            payload = _fake_read(text)
        elif "[task:writer]" in text:
            payload = _fake_write(text)
        else:
            payload = {}
        out = json.dumps(payload)
        tokens_in, tokens_out = len(text) // 4, len(out) // 4
        return AIMessage(
            content=out,
            usage_metadata={
                "input_tokens": tokens_in,
                "output_tokens": tokens_out,
                "total_tokens": tokens_in + tokens_out,
            },
        )

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._answer(messages))])

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        if settings.fake_step_delay_ms:
            await asyncio.sleep(settings.fake_step_delay_ms / 1000)
        return self._generate(messages)

    def _stream(
        self, messages: list[BaseMessage], *args: Any, **kwargs: Any
    ) -> Iterator[ChatGenerationChunk]:
        """astream_events streams chat models; emit the whole scripted answer as one chunk."""
        answer = self._answer(messages)
        yield ChatGenerationChunk(
            message=AIMessageChunk(content=answer.content, usage_metadata=answer.usage_metadata)
        )


def _fake_plan(text: str) -> dict[str, Any]:
    count = int(m.group(1)) if (m := re.search(r"exactly (\d+) sub-questions", text)) else 3
    question = m.group(1) if (m := re.search(r"<question>(.*?)</question>", text, re.S)) else ""
    feedback = " (revised)" if "<feedback>" in text else ""
    angles = ["background", "current state", "key challenges", "evidence", "outlook", "examples"]
    return {
        "sub_questions": [
            {
                "text": f"What is the {angles[i % 6]} of: {question.strip()[:120]}?{feedback}",
                "reason": f"Covers the {angles[i % 6]} angle.",
            }
            for i in range(count)
        ]
    }


def _fake_read(text: str) -> dict[str, Any]:
    body = m.group(1) if (m := re.search(r"<untrusted_web_content>(.*?)</", text, re.S)) else ""
    first = re.split(r"(?<=[.!?])\s", body.strip(), maxsplit=1)[0]
    return {"summary": f"The page reports: {first}", "quote": first}


def _fake_write(text: str) -> dict[str, Any]:
    nums = sorted({int(n) for n in re.findall(r"^\[(\d+)\] ", text, re.M)})
    cited = nums[:3] or [1]
    cites = " ".join(f"[{n}]" for n in cited)
    return {
        "key_findings": [f"Finding {i + 1} [{n}]" for i, n in enumerate(cited)],
        "markdown": f"## Overview\n\nThe sources agree on the main points {cites}.\n\n"
        f"## Details\n\nMore detail is in the collected sources {cites}.",
    }
