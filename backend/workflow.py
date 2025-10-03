"""
workflow.py
Main function that accepts a prompt as an input and returns data 
utilizing a Langchain agent by calling appropriate tools.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import initialize_agent, AgentType
from langchain_core.callbacks import BaseCallbackHandler
import os
from dotenv import load_dotenv
import tools

dotenv = load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = "gemini-2.5-flash"

class ToolCapture(BaseCallbackHandler):
    """
    Detects and returns the tool(s) the agent uses to execute given instructions
    """
    def __init__(self):
        self.tools = []
    def on_tool_start(self, serialized, input_str, **kwargs):
        name = serialized.get("name")
        if name:
            self.tools.append(name)

def run_agent(prompt: str):
    """
    This function accepts a prompt as a paramter, and returns the response
    from Gemini API
    """
    handler = ToolCapture()
    llm = ChatGoogleGenerativeAI(model= MODEL, google_api_key= GEMINI_API_KEY)
    agent = initialize_agent(tools.lst_tools, llm, agent=AgentType.OPENAI_FUNCTIONS, return_direct=True)

    res = agent.invoke({"input": prompt}, config={"callbacks": [handler]})
    tool_name = handler.tools[-1] if handler.tools else None
    print("Tool returned: ", tool_name)

    return {
        "output": res["output"],
        "action": str(tool_name)
    }
