"use client";

import { Sparkles, Zap, Shield, Cloud, Cpu, Users } from "lucide-react";

const comingSoonFeatures = [
  {
    icon: Sparkles,
    title: "Multi-Agent Orchestration",
    description:
      "Run multiple AI agents simultaneously with intelligent task distribution and coordination.",
    status: "In Development",
  },
  {
    icon: Zap,
    title: "Real-Time Collaboration",
    description:
      "Work with teammates in real-time with live cursors, presence indicators, and shared sessions.",
    status: "Planned",
  },
  {
    icon: Shield,
    title: "Enhanced Security",
    description:
      "Advanced sandboxing, code signing verification, and secure credential management.",
    status: "Planned",
  },
  {
    icon: Cloud,
    title: "Cloud Sync",
    description:
      "Sync your settings, plugins, and workspace configurations across devices.",
    status: "Planned",
  },
  {
    icon: Cpu,
    title: "Local LLM Support",
    description:
      "Run local language models for offline AI assistance with Ollama and LM Studio integration.",
    status: "In Development",
  },
  {
    icon: Users,
    title: "Team Workspaces",
    description:
      "Shared project configurations, MCP servers, and agent templates for teams.",
    status: "Planned",
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <span className="text-accent text-sm font-medium tracking-wider uppercase">
            Roadmap
          </span>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold gradient-text text-balance">
            What&apos;s coming next
          </h2>
          <p className="mt-6 text-lg text-muted leading-relaxed">
            We&apos;re just getting started. Here&apos;s what we&apos;re building for V2 and beyond.
          </p>
        </div>

        {/* Coming soon grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {comingSoonFeatures.map((feature) => {
            const Icon = feature.icon;
            const isInDevelopment = feature.status === "In Development";
            
            return (
              <div
                key={feature.title}
                className="group relative p-8 rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 transition-all hover:border-muted hover:bg-card"
              >
                {/* Status badge */}
                <div className={`
                  absolute top-4 right-4 px-3 py-1 text-xs font-medium rounded-full
                  ${isInDevelopment 
                    ? "bg-accent/10 text-accent" 
                    : "bg-muted-foreground/10 text-muted-foreground"
                  }
                `}>
                  {feature.status}
                </div>

                {/* Icon */}
                <div className="inline-flex items-center justify-center size-12 rounded-[var(--radius-sm)] bg-card border border-border mb-6">
                  <Icon className="size-6 text-muted-foreground" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted mb-6">
            Want to influence the roadmap? Contribute or open an issue.
          </p>
          <a
            href="https://github.com/nullxnothing/daemon/issues"
            className="inline-flex items-center gap-2 text-accent hover:underline underline-offset-4"
          >
            Open an issue on GitHub
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </section>
  );
}
