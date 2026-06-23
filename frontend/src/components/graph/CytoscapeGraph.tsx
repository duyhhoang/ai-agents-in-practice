"use client";

import { useEffect, useMemo, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core } from "cytoscape";
import type { EvidenceGraph, EvidenceNode } from "@/types/evidence";
import { toCytoscapeElements } from "@/lib/graph-transform";

type Props = {
  graph: EvidenceGraph;
  onSelectNode: (node: EvidenceNode | null) => void;
};

export default function CytoscapeGraph({ graph, onSelectNode }: Props) {
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo(() => {
    return toCytoscapeElements(graph);
  }, [graph]);

  function handleCy(cy: Core) {
    cyRef.current = cy;

    cy.removeAllListeners();

    cy.on("tap", "node", (event) => {
      const raw = event.target.data("raw") as EvidenceNode;
      onSelectNode(raw);
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        onSelectNode(null);
      }
    });
  }

  useEffect(() => {
    const cy = cyRef.current;

    if (!cy) return;
    if (!elements.length) return;

    const timeout = window.setTimeout(() => {
      try {
        const layoutName = elements.length > 80 ? "grid" : "breadthfirst";

        cy.layout({
          name: layoutName,
          directed: true,
          fit: true,
          padding: 60,
          spacingFactor: 1.25,
          avoidOverlap: true,
        }).run();

        cy.minZoom(0.2);
        cy.maxZoom(2.5);
        cy.fit(undefined, 60);
      } catch (error) {
        console.error("Cytoscape layout failed:", error);
      }
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [elements]);

  return (
      <div className="h-full w-full">
        <CytoscapeComponent
            elements={elements}
            cy={handleCy}
            style={{ width: "100%", height: "100%" }}
            stylesheet={[
              {
                selector: "node",
                style: {
                  label: "data(label)",
                  "background-color": "data(color)",
                  color: "#f8fafc",
                  "font-size": 11,
                  "text-valign": "bottom",
                  "text-halign": "center",
                  "text-margin-y": 8,
                  width: 44,
                  height: 44,
                  "border-color": "#020617",
                  "border-width": 2,
                },
              },
              {
                selector: "edge",
                style: {
                  label: "data(label)",
                  width: 2,
                  "line-color": "#94a3b8",
                  "target-arrow-color": "#94a3b8",
                  "target-arrow-shape": "triangle",
                  "curve-style": "bezier",
                  color: "#e2e8f0",
                  "font-size": 8,
                  "text-background-color": "#0f172a",
                  "text-background-opacity": 0.9,
                  "text-background-padding": "3px",
                },
              },
              {
                selector: "node:selected",
                style: {
                  "border-color": "#60a5fa",
                  "border-width": 5,
                },
              },
            ]}
        />
      </div>
  );
}