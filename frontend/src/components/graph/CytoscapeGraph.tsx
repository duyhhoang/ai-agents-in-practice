"use client";

import { useEffect, useMemo, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core } from "cytoscape";
import type { EvidenceGraph, EvidenceNode } from "@/types/evidence";
import { toCytoscapeElements } from "@/lib/graph-transform";

type Props = {
  graph: EvidenceGraph;
  onSelectNode: (node: EvidenceNode | null) => void;
  selectedNodeId?: string;
  isActive?: boolean;
  mouseMode?: "pan" | "select";
  layoutName?: "directed" | "organic" | "circle";
};

export default function CytoscapeGraph({ 
  graph, 
  onSelectNode, 
  selectedNodeId, 
  isActive = true,
  mouseMode = "pan",
  layoutName = "organic"
}: Props) {
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo(() => {
    return toCytoscapeElements(graph);
  }, [graph]);

  function handleCy(cy: Core) {
    cyRef.current = cy;

    cy.removeAllListeners();

    // Tap node handler
    cy.on("tap", "node", (event) => {
      const raw = event.target.data("raw") as EvidenceNode;
      onSelectNode(raw);
    });

    // Tap background handler
    cy.on("tap", (event) => {
      if (event.target === cy) {
        onSelectNode(null);
      }
    });

    // Mouse hover z-index and foreground highlighting
    cy.on("mouseover", "node, edge", (event) => {
      const target = event.target;
      target.addClass("hovered");
      // If it's a node, make label more prominent
      if (target.isNode()) {
        target.style({
          "font-size": 12,
          "text-background-opacity": 1,
          "text-background-color": "#ffffff",
          "text-background-padding": "3px",
          "text-background-shape": "roundrectangle"
        });
      }
    });

    cy.on("mouseout", "node, edge", (event) => {
      const target = event.target;
      target.removeClass("hovered");
      if (target.isNode()) {
        target.removeStyle("font-size text-background-opacity text-background-color text-background-padding text-background-shape");
      }
    });

    // Configure initial mouse interactions
    applyMouseMode(cy, mouseMode);
  }

  function applyMouseMode(cy: Core, mode: "pan" | "select") {
    if (mode === "select") {
      cy.userPanningEnabled(false);
      cy.boxSelectionEnabled(true);
      cy.autoungrabify(true); // Disable dragging nodes to make box selection easier
    } else {
      cy.userPanningEnabled(true);
      cy.boxSelectionEnabled(true); // Still allow shift+drag for box selection
      cy.autoungrabify(false); // Allow dragging nodes to move them
    }
  }

  // Handle mouseMode changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyMouseMode(cy, mouseMode);
  }, [mouseMode]);

  // Focus and select node programmatically, and apply neighborhood highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Reset styles
    cy.elements().removeClass("highlighted").removeClass("dimmed");

    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId);
      if (node && node.length > 0) {
        // Select node
        cy.nodes().unselect();
        node.select();

        // Highlighting neighborhood: connected edges and neighbors
        const neighborhood = node.closedNeighborhood();
        neighborhood.addClass("highlighted");
        cy.elements().not(neighborhood).addClass("dimmed");

        // Center on the clicked node
        cy.animate({
          center: { eles: node },
          zoom: 1.25
        }, {
          duration: 350
        });
      }
    }
  }, [selectedNodeId, elements]);

  // Handle active tab changes (resize container & fit)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !isActive) return;

    const timeout = window.setTimeout(() => {
      cy.resize();
      cy.fit(undefined, 50);
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [isActive, elements]);

  // Handle dynamic layout name changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !elements.length) return;

    const timeout = window.setTimeout(() => {
      try {
        let name = "cose";
        let directed = false;

        if (layoutName === "directed") {
          name = "breadthfirst";
          directed = true;
        } else if (layoutName === "circle") {
          name = "circle";
        }

        const layout = cy.layout({
          name,
          directed,
          fit: true,
          padding: 50,
          spacingFactor: layoutName === "circle" ? 0.9 : 1.25,
          avoidOverlap: true,
        } as any);

        layout.run();
      } catch (error) {
        console.error("Cytoscape layout failed:", error);
      }
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [elements, layoutName]);

  return (
      <div className="h-full w-full bg-slate-50">
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
                  color: "#1e293b",
                  "font-size": 10,
                  "font-weight": "bold",
                  "text-valign": "bottom",
                  "text-halign": "center",
                  "text-margin-y": 6,
                  width: 32,
                  height: 32,
                  "border-color": "#ffffff",
                  "border-width": 2,
                },
              },
              {
                selector: "edge",
                style: {
                  label: "data(label)",
                  width: 1.5,
                  "line-color": "#cbd5e1",
                  "target-arrow-color": "#cbd5e1",
                  "target-arrow-shape": "triangle",
                  "curve-style": "bezier",
                  color: "#475569",
                  "font-size": 8,
                  "text-background-color": "#ffffff",
                  "text-background-opacity": 0.95,
                  "text-background-padding": "2px",
                  "text-background-shape": "roundrectangle",
                },
              },
              {
                selector: "node:selected",
                style: {
                  "border-color": "#0065bd",
                  "border-width": 4,
                },
              },
              {
                selector: ".hovered",
                style: {
                  "z-index": 9999,
                }
              },
              {
                selector: "edge.hovered",
                style: {
                  width: 3,
                  "line-color": "#0065bd",
                  "target-arrow-color": "#0065bd"
                }
              },
              {
                selector: ".dimmed",
                style: {
                  opacity: 0.25,
                  "z-index": 1
                }
              },
              {
                selector: ".highlighted",
                style: {
                  opacity: 1,
                  "z-index": 1000
                }
              },
              {
                selector: "node.highlighted",
                style: {
                  "border-color": "#0065bd",
                  "border-width": 3,
                }
              },
              {
                selector: "edge.highlighted",
                style: {
                  width: 3,
                  "line-color": "#0065bd",
                  "target-arrow-color": "#0065bd",
                }
              }
            ]}
        />
      </div>
  );
}