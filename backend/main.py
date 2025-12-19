"""
main.py
The main agent is called and returns structured output
based on the call
"""

from __future__ import annotations
from pydantic_ai import Agent
from dataclasses import asdict
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
When a request is vague, default to Generate
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
        # result.data is a Pydantic model (one of your Result union types)
        # Convert it to a dict
        output = asdict(result)["output"]
        
        return output.dict()
    
    except Exception as e:
        return e
    
