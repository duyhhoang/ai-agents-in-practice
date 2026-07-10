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
  workflowIds: string[];
};

export const scalesAgents: ScalesAgent[] = [
  {
    letter: "S",
    codename: "Sentinel",
    role: "Risk Analyst",
    description: "Detects supplier, process, delivery, and operational threats.",
    color: "red",
    icon: AlertTriangle,
    keywords: [
      "risk",
      "risky",
      "threat",
      "delay",
      "delayed",
      "issue",
      "failure",
      "disruption",
      "incident",
      "bottleneck",
      "critical",
    ],
    workflowIds: ["risk_analyst", "risk analyst", "sentinel"],
  },
  {
    letter: "C",
    codename: "Calibrator",
    role: "Quality Analyst",
    description: "Evaluates defects, quality scores, inspections, and reliability.",
    color: "purple",
    icon: BadgeCheck,
    keywords: [
      "quality",
      "defect",
      "inspection",
      "score",
      "reliability",
      "test",
      "testing",
      "audit",
      "notification",
    ],
    workflowIds: ["quality_analyst", "quality analyst", "calibrator"],
  },
  {
    letter: "A",
    codename: "Acquirer",
    role: "Procurement Specialist",
    description: "Analyzes suppliers, purchase orders, sourcing, and cost.",
    color: "blue",
    icon: PackageSearch,
    keywords: [
      "supplier",
      "suppliers",
      "procurement",
      "purchase",
      "purchasing",
      "purchase order",
      "purchase orders",
      "po",
      "order",
      "orders",
      "vendor",
      "vendors",
      "material",
      "materials",
      "inventory",
      "stock",
      "sourcing",
      "cost",
      "closed",
      "open",
      "status",
    ],
    workflowIds: ["procurement_specialist", "procurement specialist", "acquirer"],
  },
  {
    letter: "L",
    codename: "Logistics Navigator",
    role: "Logistics Specialist",
    description: "Tracks charging station locations, sites, routes, shipping, lead times, and delivery status.",
    color: "orange",
    icon: Route,
    keywords: [
      "logistics",
      "route",
      "routes",
      "shipping",
      "transport",
      "transportation",
      "delivery",
      "lead time",
      "charging station",
      "charging stations",
      "station",
      "stations",
      "location",
      "locations",
      "located",
      "site",
      "sites",
      "country",
      "countries",
      "infrastructure",
      "warehouse",
      "freight",
    ],
    workflowIds: ["logistics_specialist", "logistics specialist", "logistics navigator"],
  },
  {
    letter: "E",
    codename: "Eco Guardian",
    role: "Sustainability Agent",
    description: "Checks ESG, recycling, emissions, waste, and sustainability impact.",
    color: "green",
    icon: Leaf,
    keywords: [
      "sustainability",
      "esg",
      "emission",
      "emissions",
      "co2",
      "carbon",
      "energy",
      "waste",
      "recycling",
      "recovery",
      "green",
      "environment",
      "environmental",
    ],
    workflowIds: ["sustainability_analyst", "sustainability analyst", "eco guardian"],
  },
  {
    letter: "M",
    codename: "Strategist",
    role: "Manager Agent",
    description: "Combines all agent outputs into one final business decision.",
    color: "yellow",
    icon: ShieldCheck,
    keywords: [
      "recommend",
      "recommendation",
      "summary",
      "decision",
      "manager",
      "action",
      "strategy",
      "strategic",
      "overview",
    ],
    workflowIds: ["manager_agent", "manager", "strategist", "coordinator"],
  },
];

export function detectActiveAgents(message: string): string[] {
  const lowerMessage = message.toLowerCase();

  const matchedAgents = scalesAgents
    .filter((agent) =>
      agent.keywords.some((keyword) => lowerMessage.includes(keyword))
    )
    .map((agent) => agent.codename);

  if (!matchedAgents.includes("Strategist")) {
    matchedAgents.push("Strategist");
  }

  return [...new Set(matchedAgents)];
}

function addAgentFromText(text: string, active: Set<string>) {
  const lower = text.toLowerCase();

  for (const agent of scalesAgents) {
    const matchedWorkflowId = agent.workflowIds.some((id) => lower.includes(id));
    const matchedRole = lower.includes(agent.role.toLowerCase());
    const matchedCodename = lower.includes(agent.codename.toLowerCase());

    if (matchedWorkflowId || matchedRole || matchedCodename) {
      active.add(agent.codename);
    }
  }
}

export function detectActiveAgentsFromResponse(response: any, fallbackMessage = ""): string[] {
  const active = new Set<string>();

  // Start with frontend keyword prediction.
  detectActiveAgents(fallbackMessage).forEach((agent) => active.add(agent));

  // Read actual n8n-selected agents if returned.
  if (Array.isArray(response?.selectedAgents)) {
    response.selectedAgents.forEach((agentId: string) => addAgentFromText(agentId, active));
  }

  if (Array.isArray(response?.routingDebug?.selectedAgents)) {
    response.routingDebug.selectedAgents.forEach((agentId: string) => addAgentFromText(agentId, active));
  }

  // Read specialist result payloads.
  if (Array.isArray(response?.specialistResults)) {
    response.specialistResults.forEach((result: any) => {
      addAgentFromText(
        [
          result?.agent,
          result?.domain,
          result?.name,
          result?.role,
          result?.status,
        ]
          .filter(Boolean)
          .join(" "),
        active
      );
    });
  }

  if (Array.isArray(response?.specialistSummary)) {
    response.specialistSummary.forEach((result: any) => {
      addAgentFromText(JSON.stringify(result), active);
    });
  }

  // Read frontend evidence trace tools.
  if (Array.isArray(response?.evidenceTrace?.toolsUsed)) {
    response.evidenceTrace.toolsUsed.forEach((tool: any) => {
      addAgentFromText(
        [
          tool?.id,
          tool?.name,
          tool?.inputSummary,
          tool?.outputSummary,
        ]
          .filter(Boolean)
          .join(" "),
        active
      );
    });
  }

  // Manager normally always synthesizes the final answer.
  active.add("Strategist");

  return [...active];
}
