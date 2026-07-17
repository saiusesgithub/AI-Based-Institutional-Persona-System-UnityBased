"""Per-session conversation memory.

Without this, every turn is stateless and follow-ups ("what about the labs?") have nothing
to refer back to. Sessions are keyed by WebSocket connection and held in memory only: a
kiosk conversation should not outlive the visitor standing at it.
"""

from dataclasses import dataclass, field

# Kept short on purpose. Long histories cost latency and tempt the model into rambling,
# and a kiosk exchange is rarely more than a few turns.
MAX_TURNS = 8


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class Conversation:
    persona_id: str | None = None
    turns: list[Turn] = field(default_factory=list)

    def add(self, role: str, content: str) -> None:
        if not content.strip():
            return
        self.turns.append(Turn(role=role, content=content))
        if len(self.turns) > MAX_TURNS:
            self.turns = self.turns[-MAX_TURNS:]

    def history(self) -> list[dict[str, str]]:
        return [{"role": turn.role, "content": turn.content} for turn in self.turns]

    def reset(self) -> None:
        self.turns.clear()

    def switch_persona(self, persona_id: str | None) -> None:
        """Switching persona starts a new conversation.

        Carrying history across a persona swap makes the new persona answer as if it had
        said things it never said.
        """
        if persona_id and persona_id != self.persona_id:
            self.reset()
        if persona_id:
            self.persona_id = persona_id
