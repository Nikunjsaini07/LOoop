import type { CompanySummary } from "./company-types";

const descriptions: Record<string, string> = {
  stripe: "The engineering behind moving money. APIs, infrastructure, and the details that make payments work.",
  cloudflare: "A closer look at the network: internet infrastructure, security, and systems built for a global scale.",
  netflix: "The systems behind the stream. Distributed infrastructure, data platforms, and the craft of reliability.",
  github: "How the home for developers gets built, from the developer experience to the infrastructure underneath.",
  spotify: "The technology behind listening. Data, experimentation, and the systems connecting people with audio.",
  uber: "Engineering in motion: real-time systems, data infrastructure, and the work of operating at scale.",
  shopify: "The craft behind commerce. Stories about performance, infrastructure, and building for merchants.",
  discord: "What it takes to bring people together: real-time communication, performance, and infrastructure.",
  airbnb: "Engineering for a world of places to stay. Infrastructure, data, and the details of a global marketplace.",
  datadog: "Inside the tools that watch our systems: observability, profiling, and the infrastructure behind them.",
  slack: "The engineering behind working together. Architecture, performance, and the people building Slack.",
};

export function companyDescription(company: CompanySummary) {
  return descriptions[company.id] ?? (company.topics.length
    ? `Ideas and lessons from ${company.name}, with writing on ${company.topics.slice(0, 3).map(topic => topic.toLowerCase()).join(", ")}.`
    : `Explore the ${company.name} blog and follow the team's next idea.`);
}

export const companyHref = (id: string) => `/?company=${encodeURIComponent(id)}`;
