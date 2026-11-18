import json
import logging
import re

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.logging import JsonFormatter
from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401


def test_json_formatter_keeps_extra_fields_and_exceptions() -> None:
    logger = logging.getLogger("fmt-test")
    try:
        raise ValueError("boom")
    except ValueError:
        record = logger.makeRecord(
            "fmt-test",
            logging.ERROR,
            __file__,
            1,
            "run failed",
            (),
            None,
            extra={"run_id": "r1", "error_id": "e1"},
        )
        record.exc_info = __import__("sys").exc_info()
    line = json.loads(JsonFormatter().format(record))
    assert line["message"] == "run failed" and line["level"] == "error"
    assert line["run_id"] == "r1" and line["error_id"] == "e1"
    assert "ValueError: boom" in line["exception"] and "timestamp" in line


@pytest.mark.usefixtures("graph_enabled")
async def test_user_facing_error_id_is_in_the_logs_with_run_and_user(
    client: AsyncClient,
    user_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(settings, "run_token_budget", 10)
    caplog.set_level(logging.INFO)
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "What is quantum computing?"}, headers=user_a
        )
    ).json()["id"]
    for _ in range(100):
        data = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()
        if data["status"] == "failed":
            break
        import asyncio

        await asyncio.sleep(0.05)
    shown = re.search(r"error id ([a-z0-9]+)", data["error"])
    assert shown, data["error"]
    records = [r for r in caplog.records if getattr(r, "error_id", None) == shown.group(1)]
    assert len(records) == 1
    assert records[0].run_id == run_id  # type: ignore[attr-defined]
    assert getattr(records[0], "user_id", None), "failure logs must say whose run it was"
