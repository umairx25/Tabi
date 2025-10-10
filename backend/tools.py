"""
tools.py
Contains a list of tools the LLM can see. Gives instructions on different types
of brwoser-related queries and ensures a structured output is returned
"""
import os
from dotenv import load_dotenv
from langchain_core.tools import tool
from schemas import Tab, TabGroup, TabList, TabGroupList
from langchain_google_genai import ChatGoogleGenerativeAI

dotenv = load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = "gemini-2.5-pro"


@tool(description="Given a list of tabs, find the tab user is looking for. Only return the tab title as a string", return_direct=True)
def search_tabs(prompt:str, tabs):

    try:
        llm_prompt = f"""\
            Look through the provided list of tabs, and return only ONE tab that best matches their description. 
            The user asked: {prompt}
            List of tabs: {tabs}
            """
        llm = ChatGoogleGenerativeAI(model= MODEL, google_api_key= GEMINI_API_KEY)
        structured_llm = llm.with_structured_output(Tab)

        result = structured_llm.invoke(llm_prompt)

        return result.model_dump()

    except Exception as e:
        print(f"[Gemini Error] {e}")


@tool(description="Generate a relevant group of browser tabs based on a user request.", return_direct=True)
def generate_tabs(user_prompt: str) -> dict:

    try:
        llm = ChatGoogleGenerativeAI(model= MODEL, google_api_key= GEMINI_API_KEY)
        structured_llm = llm.with_structured_output(TabGroup)

        result = structured_llm.invoke(
            f"""
            You are a browser assistant that helps users by generating useful tabs.

            The user wants to: {user_prompt}

            Rules:
            1. Generate 5-7 high-quality, diverse tabs that will help the user accomplish their task.
            2. Include 1-2 utility tabs such as tools or references (e.g., Google Maps, Docs).
            3. Return ONLY valid structured data that matches the TabGroup schema.
            4. Use accurate and descriptive tab titles and URLs.
            """
        )

        return result.model_dump()
    
    except Exception as e:
        print(f"[Gemini Error] {e}")

@tool(description="Given a list of tabs, remove any tabs the user asked to remove.", return_direct=True)
def close_tabs(prompt:str, tabs):

    try:
        llm_prompt = f"""
                    You are given a list of open browser tabs in JSON format:
                    {tabs}

                    User request: {prompt}

                    Return ONLY the tabs from the provided list that should be closed. 
                    Do NOT make up any tabs. 
                    The output must strictly be a list of tabs in the same JSON format.
                    Do not put in the list any tabs that are unrelated to the user's request,
                    even if it means returning an empty output.
                    """
        llm = ChatGoogleGenerativeAI(model= MODEL, google_api_key= GEMINI_API_KEY)
        structured_llm = llm.with_structured_output(TabList)

        result = structured_llm.invoke(llm_prompt + prompt)

        print("Result type:", type(result))
        print("Result value:", result)

        return result.model_dump()

    except Exception as e:
        print(f"[Gemini Error] {e}")


@tool(
    description="Organize or modify tabs/groups based on user instructions.",
    return_direct=True
)
def organize_tabs(prompt: str, tabs: list[dict]):
    """
    A unified tool that can:
    - Reorganize existing tabs into groups
    - Add new tabs to existing groups
    - Create new groups if requested
    - Leave groups untouched if not mentioned
    """

    try:
        llm = ChatGoogleGenerativeAI(model=MODEL, google_api_key=GEMINI_API_KEY)
        structured_llm = llm.with_structured_output(TabGroupList)

        llm_prompt = f"""
        You are a browser tab manager. You are given the user's current tab groups in JSON format:
        {tabs}

        User request: {prompt}

        Your task:
        - Reorganize tabs or groups as needed based on the user's instructions.
        - You may not remove or rename existing tab groups unless specified, can only add to it.
        - You may add new tabs or new groups unless requested, always prioritize modifying using existing resources
        - Do NOT remove or reorder existing tabs unless explicitly told to.
        - If user wants to ungroup tab(s) from a group, make its new group ungrouped
        """

        result = structured_llm.invoke(llm_prompt)

        print("Organize Tabs Result:", result.model_dump())
        return result.model_dump()

    except Exception as e:
        print(f"[Gemini Error] {e}")
        return {"tabs": []}


lst_tools = [
    obj for obj in globals().values()
    if callable(obj) and hasattr(obj, "description")
]