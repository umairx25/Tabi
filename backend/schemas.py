"""
schemas.py
Contains a list of pydantic schemas that represent different browser related
objects, helping ensure proper LLM structure
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional


class Tab(BaseModel):
    "A representation of a single tab"
    title: str = Field(..., description="The tab's title")
    url: str = Field(..., description="The tab's url")
    description: str = Field(..., description="The tab's description")

class TabList(BaseModel):
    "A list of tabs"
    tabs: List[Tab] = Field(..., description="A list of tabs")

class TabGroup(BaseModel):
    "A group of tabs along with an identifying group name"
    group_name: str = Field(..., description="The name of the tab group")
    tabs: List[Tab] = Field(..., description="A list of tab groups")

class TabGroupList(BaseModel):
    "A list of tab groups"
    tabs: List[TabGroup] = Field(..., description="A list of tab groups")

class Bookmark(BaseModel):
    id: str = Field(..., description="The bookmark's unique Chrome ID")
    title: str
    url: Optional[str] = None

class BookmarkTree(BaseModel):
    bookmarks: List[Bookmark] = Field(..., description="Flat list of all bookmarks")