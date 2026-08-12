"""
main.py
The main agent is called and returns structured output
based on the call
"""

from __future__ import annotations
from pydantic_ai import Agent
from dotenv import load_dotenv
from schemas import Result

# ---------- ENV / CONFIG ----------
load_dotenv()
MODEL = "google-gla:gemini-2.5-flash"


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


agent = Agent[None, Result](
    model=MODEL,
    system_prompt=SYSTEM_PROMPT,
    output_type= Result
)

# Single call
async def run_agent(prompt: str, tabs: list[dict]):
    try:
        result = await agent.run(f"Tabs: {tabs}\nUser: {prompt}")
        output = getattr(result, "output", None) or getattr(result, "data", None)

        if hasattr(output, "model_dump"):
            return output.model_dump()
        if hasattr(output, "dict"):
            return output.dict()
        return output

    except Exception as e:
        return e
    
