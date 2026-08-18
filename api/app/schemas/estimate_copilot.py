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
