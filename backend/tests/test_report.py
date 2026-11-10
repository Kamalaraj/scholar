import re

import pytest
from httpx import AsyncClient

from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401
from tests.test_stream import _finished_run


@pytest.mark.usefixtures("graph_enabled")
async def test_every_citation_maps_to_a_stored_source(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _finished_run(client, user_a)
    run = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()
    numbers = {s["citation_num"] for s in run["sources"]}
    assert numbers == set(range(1, len(numbers) + 1))
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", run["report"]["markdown"])}
    cited |= {int(n) for k in run["report"]["key_findings"] for n in re.findall(r"\[(\d+)\]", k)}
    assert cited and cited <= numbers
    assert 3 <= len(run["report"]["key_findings"]) <= 5
    assert all(s["url"].startswith("http") and s["title"] and s["domain"] for s in run["sources"])


@pytest.mark.usefixtures("graph_enabled")
async def test_report_markdown_download(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    run_id = await _finished_run(client, user_a)
    res = await client.get(f"/api/v1/runs/{run_id}/report.md", headers=user_a)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert (
        'attachment; filename="how-do-solid-state-batteries-work.md"'
        in res.headers["content-disposition"]
    )
    body = res.text
    assert body.startswith("# How do solid-state batteries work?")
    assert "## Key findings" in body and "## Sources" in body
    run = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()
    assert body.count("](http") == len(run["sources"])

    assert (await client.get(f"/api/v1/runs/{run_id}/report.md")).status_code == 401
    assert (await client.get(f"/api/v1/runs/{run_id}/report.md", headers=user_b)).status_code == 404


@pytest.mark.usefixtures("graph_enabled")
async def test_report_markdown_is_404_before_the_report_exists(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "What is quantum computing?"}, headers=user_a
        )
    ).json()["id"]
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    assert (await client.get(f"/api/v1/runs/{run_id}/report.md", headers=user_a)).status_code == 404


def test_exported_source_lines_cannot_inject_markdown() -> None:
    from app.services.run_service import source_line

    evil = source_line(1, "Nice](javascript:alert(1)) [x\nnew line", "https://x.org/a", "x.org")
    assert "\n" not in evil
    assert not re.search(r"(?<!\\)\]\(javascript", evil)  # only an escaped bracket remains
    assert evil.startswith("1. [Nice\\](javascript:alert(1)) \\[x new line](https://x.org/a)")
    # A non-http(s) url is never turned into a link.
    plain = source_line(2, "Local file", "file:///etc/passwd", "localhost")
    assert "](" not in plain and "file:///etc/passwd" not in plain
    # Parentheses in a url must not end the link early.
    assert "(https://x.org/a%29b)" in source_line(3, "T", "https://x.org/a)b", "x.org")
