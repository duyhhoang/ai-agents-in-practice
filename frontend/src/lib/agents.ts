import {
  AlertTriangle,
  BadgeCheck,
  Leaf,
  PackageSearch,
  Route,
  ShieldCheck,
} from "lucide-react";

export type ScalesAgent = {
  letter: string;
  codename: string;
  role: string;
  description: string;
  color: string;
  icon: typeof AlertTriangle;
  keywords: string[];
};

export const scalesAgents: ScalesAgent[] = [
  {
    letter: "S",
    codename: "Sentinel",
    role: "Risk Analyst",
    description: "Detects supplier, process, delivery, and operational threats.",
    color: "red",
    icon: AlertTriangle,
    keywords: ["risk", "risky", "threat", "delay", "issue", "failure", "disruption"],
  },
  {
    letter: "C",
    codename: "Calibrator",
    role: "Quality Analyst",
    description: "Evaluates defects, quality scores, inspections, and reliability.",
    color: "purple",
    icon: BadgeCheck,
    keywords: ["quality", "defect", "inspection", "score", "reliability"],
  },
  {
    letter: "A",
    codename: "Acquirer",
    role: "Procurement Specialist",
    description: "Analyzes suppliers, purchase orders, sourcing, and cost.",
    color: "blue",
    icon: PackageSearch,
    keywords: ["supplier", "procurement", "purchase", "po", "order", "sourcing", "cost"],
  },
  {
    letter: "L",
    codename: "Logistics Navigator",
    role: "Logistics Specialist",
    description: "Tracks movement, routes, shipping, lead times, and delivery status.",
    color: "orange",
    icon: Route,
    keywords: ["logistics", "route", "shipping", "transport", "delivery", "lead time"],
  },
  {
    letter: "E",
    codename: "Eco Guardian",
    role: "Sustainability Agent",
    description: "Checks ESG, recycling, emissions, waste, and sustainability impact.",
    color: "green",
    icon: Leaf,
    keywords: ["sustainability", "esg", "emission", "waste", "recycling", "green"],
  },
  {
    letter: "S",
    codename: "Strategist",
    role: "Manager Agent",
    description: "Combines all agent outputs into one final business decision.",
    color: "yellow",
    icon: ShieldCheck,
    keywords: ["recommend", "summary", "decision", "manager", "action", "strategy"],
  },
];

export function detectActiveAgents(message: string): string[] {
  const lowerMessage = message.toLowerCase();

  const matchedAgents = scalesAgents
    .filter((agent) =>
      agent.keywords.some((keyword) => lowerMessage.includes(keyword))
    )
    .map((agent) => agent.codename);

  if (matchedAgents.length === 0) {
    return ["Strategist"];
  }

  if (!matchedAgents.includes("Strategist")) {
    matchedAgents.push("Strategist");
  }

  return matchedAgents;
}