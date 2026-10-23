"use client";

import katex from "katex";
import { useMemo } from "react";
import type { BoardCommand } from "@/lib/types";
import { anchor, BOARD_W, buildBoard, centerOf, type Placed } from "./layout";

const COLORS = {
  accent: { fill: "rgba(155,225,93,0.28)", stroke: "#9be15d" },
  success: { fill: "rgba(95,211,141,0.3)", stroke: "#5fd38d" },
  warning: { fill: "rgba(245,195,91,0.3)", stroke: "#f5c35b" },
};

function Equation({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      // trust:false (default) keeps KaTeX from emitting arbitrary HTML.
      return katex.renderToString(latex, { throwOnError: true, displayMode: true });
    } catch {
      return null;
    }
  }, [latex]);
  if (html === null) return <code className="text-mist">{latex}</code>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Whiteboard({ steps, current }: { steps: BoardCommand[][]; current: number }) {
  const model = useMemo(() => buildBoard(steps, current), [steps, current]);
  const byId = new Map(model.placed.map((p) => [p.cmd.id, p]));

  const isNew = (id: string) => model.newIds.has(id);

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${model.height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Teaching whiteboard"
    >
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#b6f07a" />
        </marker>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 0 40" fill="none" stroke="rgba(170,230,190,0.05)" />
        </pattern>
      </defs>
      <rect width={BOARD_W} height={model.height} fill="url(#grid)" />

      {model.links.map(({ cmd, arrow }) => {
        const a = byId.get(cmd.from_id);
        const b = byId.get(cmd.to_id);
        if (!a || !b) return null;
        const ca = centerOf(a);
        const cb = centerOf(b);
        const p1 = anchor(a, cb.x, cb.y);
        const p2 = anchor(b, ca.x, ca.y);
        const hl = model.highlights.get(cmd.id);
        return (
          <g key={cmd.id}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={hl ? COLORS[hl.color].stroke : arrow && cmd.action === "draw_arrow" ? "#b6f07a" : "rgba(220,240,225,0.6)"}
              strokeWidth={hl ? 3 : 2}
              strokeDasharray={cmd.action === "draw_arrow" ? "6 5" : undefined}
              markerEnd={arrow ? "url(#arrowhead)" : undefined}
              className={isNew(cmd.id) ? "board-line-new" : undefined}
            />
            {cmd.label && (
              <text x={(p1.x + p2.x) / 2 + 6} y={(p1.y + p2.y) / 2 - 6} fill="#c9dccf" fontSize="14" className="bn">
                {cmd.label}
              </text>
            )}
          </g>
        );
      })}

      {model.placed.map((p) => (
        <g key={p.cmd.id} className={isNew(p.cmd.id) ? "board-new" : undefined}>
          <PlacedItem p={p} hl={model.highlights.get(p.cmd.id)} />
        </g>
      ))}
    </svg>
  );
}

function PlacedItem({ p, hl }: { p: Placed; hl?: { indices?: number[]; color: keyof typeof COLORS } }) {
  const ring = hl && !hl.indices ? COLORS[hl.color] : null;
  switch (p.kind) {
    case "heading":
      return (
        <foreignObject x={p.x} y={p.y} width={p.w} height={p.h}>
          <div className="bn truncate text-[28px] font-semibold text-white" style={{ textShadow: ring ? `0 0 18px ${ring.stroke}` : undefined }}>
            {p.cmd.text}
          </div>
        </foreignObject>
      );
    case "text":
      return (
        <foreignObject x={p.x} y={p.y} width={p.w} height={p.h}>
          <div
            className={`bn rounded-xl border px-3 py-2 text-[17px] leading-[26px] ${
              p.cmd.style === "note" ? "border-warn/30 bg-warn/5 text-warn" : "border-white/10 bg-white/[0.03] text-mist"
            }`}
            style={ring ? { borderColor: ring.stroke, boxShadow: `0 0 16px ${ring.fill}` } : undefined}
          >
            {p.cmd.text}
          </div>
        </foreignObject>
      );
    case "equation":
      return (
        <foreignObject x={p.x} y={p.y} width={p.w} height={p.h}>
          <div
            className="flex h-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20"
            style={ring ? { borderColor: ring.stroke } : undefined}
          >
            <Equation latex={p.cmd.latex} />
          </div>
        </foreignObject>
      );
    case "array": {
      const top = p.y + (p.cmd.label ? 26 : 0);
      return (
        <g>
          {p.cmd.label && (
            <text x={p.x} y={p.y + 16} fill="#8aa596" fontSize="15" className="bn">
              {p.cmd.label}
            </text>
          )}
          {p.cmd.values.map((v, i) => {
            const on = hl?.indices?.includes(i);
            const col = on ? COLORS[hl!.color] : ring;
            return (
              <g key={i}>
                <rect
                  x={p.x + i * p.cell + 2}
                  y={top}
                  width={p.cell - 4}
                  height={p.cell - 4}
                  rx={10}
                  fill={on ? col!.fill : "rgba(255,255,255,0.04)"}
                  stroke={col ? col.stroke : "rgba(170,230,190,0.35)"}
                  strokeWidth={on ? 2.5 : 1.5}
                  style={{ transition: "all .35s ease" }}
                />
                <text
                  x={p.x + i * p.cell + p.cell / 2}
                  y={top + p.cell / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#f1fbec"
                  fontSize={Math.min(22, p.cell / 2.4)}
                  fontWeight={on ? 700 : 500}
                >
                  {String(v)}
                </text>
                <text x={p.x + i * p.cell + p.cell / 2} y={top + p.cell + 12} textAnchor="middle" fill="#6f8a7b" fontSize="12">
                  {i}
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    case "node": {
      const c = centerOf(p);
      const col = hl ? COLORS[hl.color] : null;
      return (
        <g>
          <circle
            cx={c.x}
            cy={c.y}
            r={p.w / 2}
            fill={col ? col.fill : "rgba(18,40,28,0.95)"}
            stroke={col ? col.stroke : "rgba(170,230,190,0.55)"}
            strokeWidth={col ? 3 : 1.8}
            style={{ transition: "all .35s ease" }}
          />
          <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" fill="#f1fbec" fontSize="15" className="bn">
            {p.cmd.label.length > 6 ? p.cmd.label.slice(0, 6) + "…" : p.cmd.label}
          </text>
        </g>
      );
    }
  }
}
