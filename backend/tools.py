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
MODEL = "gemini-2.5-flash"

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



@tool(description="Organize tabs into groups or leave them ungrouped based on user instructions.", return_direct=True)
def organize_tabs(prompt: str, tabs: list[dict]):
    """
    Example inputs:
    - "Put all research tabs into group Research"
    - "Move coding tabs into group Dev and finance tabs into group Money"
    - "Place YouTube tabs in a new group called Videos"
    - "Leave social media tabs ungrouped"
    """

    try:
        # Prepare the LLM
        llm = ChatGoogleGenerativeAI(model=MODEL, google_api_key=GEMINI_API_KEY)
        structured_llm = llm.with_structured_output(TabGroupList)

        # Build a strict prompt
        llm_prompt = f"""
        You are given a list of open browser tabs in JSON format:
        {tabs}

        User request: {prompt}

        Your task:
        - Organize the tabs into logical groups based on the user's request.
        - If a tab should remain ungrouped, put it in a group named "Ungrouped".
        - Add new tab group ONLY if the user mentions a tab group you dont see in the list of tab groups.
        - Only use the tabs provided in the input.
        """

        # Run the model
        result = structured_llm.invoke(llm_prompt)

        print(result.model_dump())

        # Return native Python dict
        return result.model_dump()

    except Exception as e:
        print(f"[Gemini Error] {e}")
        return {"tabs": []}



lst_tools = [
    obj for obj in globals().values()
    if callable(obj) and hasattr(obj, "description")
]