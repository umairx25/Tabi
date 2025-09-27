"""
Schemas.py
"""
from pydantic import BaseModel, Field
from typing import List


class Tab(BaseModel):
    "A representation of a single tab"
    title: str = Field(..., description="The tab's title")
    url: str = Field(..., description="The tab's url")
    description: str = Field(..., description="The tab's description")

class TabList(BaseModel):
    tabs: List[Tab] = Field(..., description="A list of tabs")

class TabGroup(BaseModel):
    "A group of tabs along with an identifying group name"
    group_name: str = Field(..., description="The name of the tab group")
    tabs: List[Tab] = Field(..., description="A list of tab groups")

class TabGroupList(BaseModel):
    tabs: List[TabGroup] = Field(..., description="A list of tab groups")