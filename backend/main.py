"""
main.py
The main agent is called and returns structured output
based on the call
"""

from __future__ import annotations
import httpx
from pydantic import TypeAdapter
from dotenv import load_dotenv
from schemas import Result

# ---------- ENV / CONFIG ----------
load_dotenv()
MODEL = "gemini-2.5-flash"


# ---------- SYSTEM PROMPT ----------
SYSTEM_PROMPT = """You are a careful browser assistant.
- Never invent tabs.
- Only operate on the provided context.
- Prefer minimal, safe edits.
- Outputs MUST validate against the declared Pydantic schema.
Given tabs and user request, decide what to do AND return the result in one go.
- Use search_tabs, close_tabs, organize_tabs, or generate_tabs only when the user clearly asks for a browser/tab action.
- If the user asks a normal question, asks for an explanation, or does not clearly request a browser/tab action, use answer_question and put the direct answer in output.
- answer_question is one question -> one answer. Do not continue as a chat.
"""


# Single call
async def run_agent(prompt: str, tabs: list[dict], api_key: str | None = None):
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    response_schema = TypeAdapter(Result).json_schema()
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{
            "role": "user",
            "parts": [{"text": f"Tabs: {tabs}\nUser: {prompt}"}],
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": response_schema,
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
            headers={"x-goog-api-key": api_key},
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    result = TypeAdapter(Result).validate_json(text)
    return result.model_dump()
    
