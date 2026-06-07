"""Generate sample AI questions for demo scenarios."""
from __future__ import annotations

import json
import os
import sys
from types import SimpleNamespace

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openai_client import client  # noqa: E402
from ai_conversation import (  # noqa: E402
    QUESTION_GENERATION_MAX_ATTEMPTS,
    _extract_question_text,
    _parse_ai_json_response,
    accept_generated_question,
    build_question_prompt,
    question_generation_retry_suffix,
    resolve_question_generation_fallback,
)


def _generate_question(
    post,
    *,
    conversation_text: str,
    prev_qs: list[str],
    step: int,
    max_steps: int,
    mode: str,
    last_a: str | None = None,
) -> str:
    sys_msg, user_msg = build_question_prompt(
        post,
        conversation_text=conversation_text,
        prev_questions=prev_qs,
        step=step,
        max_steps=max_steps,
        mode=mode,
    )
    last_candidate = ""
    for attempt in range(QUESTION_GENERATION_MAX_ATTEMPTS):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0.6,
                messages=[
                    {"role": "system", "content": sys_msg},
                    {
                        "role": "user",
                        "content": user_msg + question_generation_retry_suffix(attempt),
                    },
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        q = _extract_question_text(data).strip()
        if not q:
            continue
        last_candidate = q
        if accept_generated_question(q, post, prev_qs, last_a, step=step):
            return q
    fallback = resolve_question_generation_fallback(last_candidate)
    if fallback:
        return fallback
    raise RuntimeError("질문 생성 실패")


def post(**kwargs):
    defaults = dict(
        title="",
        content="",
        options="",
        category="기타",
        ai_mode="quick",
        ai_question_steps=3,
        post_kind="ai",
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def run_conversation(name: str, p, *, answers: list[str], max_steps: int = 3) -> None:
    print("=" * 60)
    print(name)
    print("=" * 60)
    conv_lines: list[str] = []
    prev_qs: list[str] = []

    for step in range(1, max_steps + 1):
        conv = "\n".join(conv_lines)
        last_a = answers[step - 2] if step > 1 else None
        q = _generate_question(
            p,
            conversation_text=conv,
            prev_qs=prev_qs,
            step=step,
            max_steps=max_steps,
            mode="quick",
            last_a=last_a,
        )
        print(f"Q{step}: {q}")
        prev_qs.append(q)
        if step <= len(answers):
            print(f"A{step}: {answers[step - 1]}")
            conv_lines.append(f"Q{step}: {q}")
            conv_lines.append(f"A{step}: {answers[step - 1]}")
    print("(설정 질문 수까지 진행 — 조기 종료는 버튼만)")


def main() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set")
        sys.exit(1)

    run_conversation(
        "점심 — 김밥 vs 샌드위치",
        post(
            title="점심 뭐 먹지",
            content="김밥이랑 샌드위치 중에 고민이에요.",
            options="김밥,샌드위치",
            category="음식",
        ),
        answers=["배고파", "별로"],
    )


if __name__ == "__main__":
    main()
