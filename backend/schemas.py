# """
# schemas.py
# Contains a list of pydantic schemas that represent different browser related
# objects, helping ensure proper LLM structure
# """

from pydantic import BaseModel, Field
from typing import List, Union


class Tab(BaseModel):
    """A representation of a single tab"""
    title: str = Field(..., description="The tab's title")
    url: str = Field(..., description="The tab's url")
    description: str = Field(..., description="The tab's description")

class TabList(BaseModel):
    "A list of tabs"
    tabs: List[Tab] = Field(..., description="A list of tabs")

class TabGroup(BaseModel):
    """A group of tabs along with an identifying group name"""
    group_name: str = Field(..., description="The name of the tab group")
    tabs: List[Tab] = Field(..., description="A list of tabs in this group")

class TabGroupList(BaseModel):
    "A list of tab groups"
    tabs: List[TabGroup] = Field(..., description="A list of tab groups")

# Define all possible output types
class SearchResult(BaseModel):
    action: str = Field(default="search_tabs")
    output: Tab  # Single tab that matches

class CloseResult(BaseModel):
    action: str = Field(default="close_tabs")
    output: TabList  # Multiple tabs to close

class OrganizeResult(BaseModel):
    action: str = Field(default="organize_tabs")
    output: TabGroupList  # Organized groups

class GenerateResult(BaseModel):
    action: str = Field(default="generate_tabs")
    output: TabGroup  # Organized groups

# Union = "one of these types"
Result = Union[SearchResult, CloseResult, OrganizeResult, GenerateResult]