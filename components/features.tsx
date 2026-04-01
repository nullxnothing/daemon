"use client";

import {
  Code2,
  Terminal,
  Bot,
  Server,
  GitBranch,
  Wallet,
  Puzzle,
  Layers,
  Globe,
  Rocket,
} from "lucide-react";

const features = [
  {
    icon: Code2,
    title: "Monaco Editor",
    description:
      "Full Monaco editor running completely offline via custom protocol handler. No CDN dependency, multi-tab support, breadcrumbs, and syntax highlighting.",
    highlight: true,
  },
  {
    icon: Terminal,
    title: "Real PTY Terminals",
    description:
      "Powered by node-pty and xterm.js. Multiple tabs, split panes, command history search, tab-completion hints, and dedicated agent sessions.",
    highlight: true,
  },
  {
    icon: Bot,
    title: "Claude Code Agent",
    description:
      "Spawn Claude Code agents with custom system prompts, model selection, and per-project MCP configurations. Agents run as real CLI sessions.",
    highlight: true,
  },
  {
    icon: Server,
    title: "MCP Management",
    description:
      "Toggle project-level and global MCP servers from the sidebar. Changes write directly to config files with restart indicators.",
  },
  {
    icon: GitBranch,
    title: "Full Git Workflow",
    description:
      "Branch switching, file and folder staging, commit, push, stash, branch creation, and tag management. All built-in.",
  },
  {
    icon: Wallet,
    title: "Solana Wallet",
    description:
      "Live portfolio tracking via Helius. SOL balance and SPL token holdings with USD values from Jupiter.",
  },
  {
    icon: Puzzle,
    title: "Plugin System",
    description:
      "Extensible architecture for loading additional panels and integrations. Build your own tools.",
  },
  {
    icon: Layers,
    title: "Multi-Project Tabs",
    description:
      "Tabbed project switching with per-project terminal sessions, MCP configs, and file trees. Context switching without losing state.",
  },
  {
    icon: Globe,
    title: "Embedded Browser",
    description:
      "Built-in browser with security sandbox for previewing and testing your applications.",
  },
  {
    icon: Rocket,
    title: "PumpFun Integration",
    description:
      "Token launches and bonding curve interactions directly from the IDE.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <span className="text-accent text-sm font-medium tracking-wider uppercase">
            V1 Features
          </span>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold gradient-text text-balance">
            Everything you need, nothing you don&apos;t
          </h2>
          <p className="mt-6 text-lg text-muted leading-relaxed">
            Purpose-built from scratch for AI-native development workflows.
            Every feature designed to work seamlessly with AI agents.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isLarge = feature.highlight;
            
            return (
              <div
                key={feature.title}
                className={`
                  group relative p-8 rounded-[var(--radius-lg)] border border-border bg-card
                  transition-all duration-300 hover:border-muted hover:bg-[#0f0f0f]
                  ${isLarge ? "md:col-span-1 lg:row-span-1" : ""}
                `}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Icon */}
                <div className={`
                  inline-flex items-center justify-center size-12 rounded-[var(--radius-sm)] mb-6
                  ${isLarge ? "bg-accent/10" : "bg-card"}
                  border border-border group-hover:border-muted transition-colors
                `}>
                  <Icon className={`size-6 ${isLarge ? "text-accent" : "text-muted"}`} />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover glow effect for highlighted features */}
                {isLarge && (
                  <div className="absolute inset-0 rounded-[var(--radius-lg)] bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
