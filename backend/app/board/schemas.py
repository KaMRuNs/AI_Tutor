"""Whiteboard command schemas (architecture.md §4.2) and semantic validation.

The model never supplies coordinates; the frontend lays objects out.
Keep in sync with frontend/lib/types.ts.
"""

import logging
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

log = logging.getLogger(__name__)


class WriteText(BaseModel):
    action: Literal["write_text"]
    id: str
    text: str = Field(max_length=300)
    style: Literal["heading", "body", "note"] = "body"


class DrawArray(BaseModel):
    action: Literal["draw_array"]
    id: str
    values: list[str | int | float] = Field(min_length=1, max_length=16)
    label: str | None = None


class DrawNode(BaseModel):
    action: Literal["draw_node"]
    id: str
    label: str = Field(max_length=40)
    group: str = "g1"


class DrawEdge(BaseModel):
    action: Literal["draw_edge"]
    id: str
    from_id: str
    to_id: str
    label: str | None = None
    directed: bool = False


class DrawArrow(BaseModel):
    action: Literal["draw_arrow"]
    id: str
    from_id: str
    to_id: str
    label: str | None = None


class DrawEquation(BaseModel):
    action: Literal["draw_equation"]
    id: str
    latex: str = Field(max_length=300)


class Highlight(BaseModel):
    action: Literal["highlight"]
    target: str
    indices: list[int] | None = None
    color: Literal["accent", "success", "warning"] = "accent"


class ClearRegion(BaseModel):
    action: Literal["clear_region"]
    ids: list[str]


class NextStep(BaseModel):
    action: Literal["next_step"]


BoardCommand = Annotated[
    WriteText | DrawArray | DrawNode | DrawEdge | DrawArrow | DrawEquation | Highlight | ClearRegion | NextStep,
    Field(discriminator="action"),
]
_command_adapter: TypeAdapter[BoardCommand] = TypeAdapter(BoardCommand)

_CREATES = {"write_text", "draw_array", "draw_node", "draw_edge", "draw_arrow", "draw_equation"}


class BoardState:
    """Tracks objects across steps so references can be checked."""

    def __init__(self) -> None:
        self.objects: dict[str, BaseModel] = {}

    def apply(self, raw_commands: list[dict]) -> list[dict]:
        """Return only commands that are valid against the current state; invalid ones are dropped."""
        accepted: list[dict] = []
        # Within a step, create objects before commands that reference them (small models often mis-order).
        ordered = sorted(raw_commands, key=lambda r: 0 if isinstance(r, dict) and r.get("action") in _CREATES
                         and r.get("action") not in {"draw_edge", "draw_arrow"} else 1)
        for raw in ordered:
            try:
                cmd = _command_adapter.validate_python(raw)
            except ValidationError as e:
                log.info("dropping malformed board command %s: %s", raw, e.error_count())
                continue
            problem = self._check(cmd)
            if problem:
                log.info("dropping board command %s: %s", raw, problem)
                continue
            if cmd.action in _CREATES:
                self.objects[cmd.id] = cmd  # type: ignore[union-attr]
            elif isinstance(cmd, ClearRegion):
                for oid in cmd.ids:
                    self.objects.pop(oid, None)
            accepted.append(cmd.model_dump(exclude_none=True))
        return accepted

    def _check(self, cmd: BaseModel) -> str | None:
        if isinstance(cmd, (DrawEdge, DrawArrow)):
            for ref in (cmd.from_id, cmd.to_id):
                if ref not in self.objects:
                    return f"unknown reference {ref}"
        if isinstance(cmd, Highlight):
            target = self.objects.get(cmd.target)
            if target is None:
                return f"unknown target {cmd.target}"
            if cmd.indices is not None:
                if not isinstance(target, DrawArray):
                    return "indices on non-array"
                if any(i < 0 or i >= len(target.values) for i in cmd.indices):
                    return "index out of range"
        if isinstance(cmd, ClearRegion) and not cmd.ids:
            return "empty clear"
        if cmd.__class__.__name__ in {"WriteText", "DrawArray", "DrawNode", "DrawEquation"}:
            if getattr(cmd, "id", "") in self.objects:
                return "duplicate id"
        return None
