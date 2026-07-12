from dataclasses import (
    dataclass,
    field,
)
from typing import (
    Any,
    Optional,
)


@dataclass
class AgentResult:
    text: str
    agent_used: str
    metadata: dict[str, Any] = field(default_factory=dict)
    action: Optional[str] = None


@dataclass
class AgentState:
    student_id: str
    transcript: str
    profile: Optional[dict[str, Any]] = None
    context: dict[str, Any] = field(default_factory=dict)
