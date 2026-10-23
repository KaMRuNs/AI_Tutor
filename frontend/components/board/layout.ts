// Deterministic board layout. The model never supplies coordinates (CLAUDE.md rule 1);
// objects are placed by kind and creation order.

import type { BoardCommand } from "@/lib/types";

export const BOARD_W = 1000;
const PAD = 36;
const LEFT_W = 600;
const RIGHT_X = 680;
const RIGHT_W = BOARD_W - RIGHT_X - PAD;
const NODE_R = 26;

type Cmd<A extends BoardCommand["action"]> = Extract<BoardCommand, { action: A }>;

export type Placed =
  | { kind: "heading"; cmd: Cmd<"write_text">; x: number; y: number; w: number; h: number }
  | { kind: "text"; cmd: Cmd<"write_text">; x: number; y: number; w: number; h: number }
  | { kind: "equation"; cmd: Cmd<"draw_equation">; x: number; y: number; w: number; h: number }
  | { kind: "array"; cmd: Cmd<"draw_array">; x: number; y: number; w: number; h: number; cell: number }
  | { kind: "node"; cmd: Cmd<"draw_node">; x: number; y: number; w: number; h: number };

export type Link = { cmd: Cmd<"draw_edge"> | Cmd<"draw_arrow">; arrow: boolean };

export interface Highlight {
  indices?: number[];
  color: "accent" | "success" | "warning";
}

export interface BoardModel {
  placed: Placed[];
  links: Link[];
  highlights: Map<string, Highlight>;
  newIds: Set<string>;
  height: number;
}

type Obj =
  | Cmd<"write_text">
  | Cmd<"draw_array">
  | Cmd<"draw_node">
  | Cmd<"draw_equation">
  | Cmd<"draw_edge">
  | Cmd<"draw_arrow">;

/** Replay steps 0..upto and lay out the surviving objects. */
export function buildBoard(steps: BoardCommand[][], upto: number): BoardModel {
  const objects = new Map<string, Obj>();
  const highlights = new Map<string, Highlight>();
  const newIds = new Set<string>();

  steps.slice(0, upto + 1).forEach((cmds, stepIdx) => {
    const current = stepIdx === upto;
    for (const c of cmds) {
      switch (c.action) {
        case "highlight":
          if (current) highlights.set(c.target, { indices: c.indices, color: c.color ?? "accent" });
          break;
        case "clear_region":
          c.ids.forEach((id) => objects.delete(id));
          break;
        case "next_step":
          break;
        default:
          objects.set(c.id, c);
          if (current) newIds.add(c.id);
      }
    }
  });

  const placed: Placed[] = [];
  const links: Link[] = [];
  const groups = new Map<string, Cmd<"draw_node">[]>();
  const edges: Cmd<"draw_edge">[] = [];

  let headY = 24;
  let leftY = 0;
  let rightY = 0;
  const leftItems: (() => void)[] = [];

  for (const o of objects.values()) {
    if (o.action === "write_text" && o.style === "heading") {
      placed.push({ kind: "heading", cmd: o, x: PAD, y: headY, w: BOARD_W - 2 * PAD, h: 46 });
      headY += 50;
    } else if (o.action === "draw_node") {
      const g = o.group ?? "g1";
      if (!groups.has(g)) {
        groups.set(g, []);
        leftItems.push(() => layoutGroup(g));
      }
      groups.get(g)!.push(o);
    } else if (o.action === "draw_edge") {
      edges.push(o);
      links.push({ cmd: o, arrow: !!o.directed });
    } else if (o.action === "draw_arrow") {
      links.push({ cmd: o, arrow: true });
    } else if (o.action === "draw_array") {
      leftItems.push(() => {
        const cell = Math.min(64, Math.floor(LEFT_W / Math.max(1, o.values.length)));
        const h = cell + (o.label ? 26 : 0) + 34;
        placed.push({ kind: "array", cmd: o, x: PAD, y: leftY, w: cell * o.values.length, h, cell });
        leftY += h + 18;
      });
    }
  }
  const top = headY + 12;
  leftY = top;
  rightY = top;

  for (const o of objects.values()) {
    if (o.action === "write_text" && o.style !== "heading") {
      const lines = Math.max(1, Math.ceil(o.text.length / 30));
      const h = lines * 26 + 18;
      placed.push({ kind: "text", cmd: o, x: RIGHT_X, y: rightY, w: RIGHT_W, h });
      rightY += h + 12;
    } else if (o.action === "draw_equation") {
      placed.push({ kind: "equation", cmd: o, x: RIGHT_X, y: rightY, w: RIGHT_W, h: 64 });
      rightY += 76;
    }
  }

  function layoutGroup(g: string) {
    const nodes = groups.get(g)!;
    const ids = new Set(nodes.map((n) => n.id));
    const children = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      if (ids.has(e.from_id) && ids.has(e.to_id)) {
        children.set(e.from_id, [...(children.get(e.from_id) ?? []), e.to_id]);
        hasParent.add(e.to_id);
      }
    }
    // BFS levels from roots; nodes unreachable from a root go to level 0.
    const level = new Map<string, number>();
    const queue = nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
    if (queue.length === 0 && nodes.length) queue.push(nodes[0].id);
    queue.forEach((id) => level.set(id, 0));
    while (queue.length) {
      const id = queue.shift()!;
      for (const c of children.get(id) ?? []) {
        if (!level.has(c)) {
          level.set(c, level.get(id)! + 1);
          queue.push(c);
        }
      }
    }
    nodes.forEach((n) => level.has(n.id) || level.set(n.id, 0));
    const rows = new Map<number, Cmd<"draw_node">[]>();
    nodes.forEach((n) => rows.set(level.get(n.id)!, [...(rows.get(level.get(n.id)!) ?? []), n]));
    const depth = Math.max(...rows.keys()) + 1;
    for (const [lv, row] of rows) {
      row.forEach((n, i) => {
        const cx = PAD + ((i + 1) * LEFT_W) / (row.length + 1);
        const cy = leftY + NODE_R + 8 + lv * 86;
        placed.push({ kind: "node", cmd: n, x: cx - NODE_R, y: cy - NODE_R, w: NODE_R * 2, h: NODE_R * 2 });
      });
    }
    leftY += depth * 86 + 20;
  }

  leftItems.forEach((f) => f());
  const height = Math.max(440, leftY + 20, rightY + 20);
  return { placed, links, highlights, newIds, height };
}

export function centerOf(p: Placed): { x: number; y: number } {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

/** Point on the border of `p` in the direction of (tx, ty), so lines don't overlap shapes. */
export function anchor(p: Placed, tx: number, ty: number): { x: number; y: number } {
  const c = centerOf(p);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (p.kind === "node") {
    const d = Math.hypot(dx, dy) || 1;
    return { x: c.x + (dx / d) * (p.w / 2), y: c.y + (dy / d) * (p.h / 2) };
  }
  const sx = Math.abs(dx) > 1e-6 ? p.w / 2 / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-6 ? p.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
