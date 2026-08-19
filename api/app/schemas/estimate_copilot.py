from typing import Optional

from pydantic import BaseModel

from .ai import ChatMessage, ToolCallLog


class EstimateCopilotChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class EstimateCopilotChatResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCallLog] = []
    # True if any tool call in this turn actually mutated the estimate --
    # lets the frontend know whether to refetch the worksheet's line items
    # instead of doing it after every single message.
    items_changed: bool = False


class NextItemSuggestion(BaseModel):
    # title=None means "nothing obvious to suggest" -- an ambient hint, not a
    # user-initiated action, so a miss/failure degrades to this empty shape
    # rather than an error the frontend has to handle.
    title: Optional[str] = None
    group_name: Optional[str] = None
    cost_code_id: Optional[str] = None
    rationale: Optional[str] = None
    # Grounded from real past line items (see search_line_items), not
    # Claude's own guess -- a starting point for the unit cost field, never
    # written anywhere until the user accepts and saves.
    suggested_unit_cost: Optional[float] = None
    cost_sample_size: int = 0
