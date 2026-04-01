"use client";

const architecturePoints = [
  {
    title: "Main Process Isolation",
    description:
      "All database access runs in the main process. The renderer communicates exclusively via IPC for security.",
  },
  {
    title: "Consistent IPC Contract",
    description:
      "Every IPC handler returns { ok, data } or { ok, error }. No raw throws across the bridge.",
  },
  {
    title: "Native Module Support",
    description:
      "better-sqlite3 and node-pty are unpacked from ASAR for production builds.",
  },
  {
    title: "Offline Monaco",
    description:
      "Monaco runs through a custom monaco-editor:// protocol. Zero network requests required.",
  },
  {
    title: "Design Token System",
    description:
      "CSS Modules with a comprehensive design token system. No utility CSS frameworks in the core.",
  },
];

const techStack = [
  { layer: "Shell", tech: "Electron 33" },
  { layer: "Build", tech: "Vite" },
  { layer: "UI", tech: "React 18, TypeScript" },
  { layer: "Editor", tech: "Monaco Editor" },
  { layer: "Terminal", tech: "node-pty, xterm.js" },
  { layer: "State", tech: "Zustand" },
  { layer: "Database", tech: "better-sqlite3 (WAL)" },
  { layer: "Git", tech: "simple-git" },
  { layer: "Packaging", tech: "electron-builder" },
];

export function Architecture() {
  return (
    <section id="architecture" className="py-32 px-6 bg-card/30">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <span className="text-accent text-sm font-medium tracking-wider uppercase">
            Architecture
          </span>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold gradient-text text-balance">
            Built right from day one
          </h2>
          <p className="mt-6 text-lg text-muted leading-relaxed">
            Clean architecture with clear separation of concerns. Every decision made intentionally.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Key decisions */}
          <div>
            <h3 className="text-2xl font-semibold mb-8">Key Decisions</h3>
            <div className="flex flex-col gap-4">
              {architecturePoints.map((point, index) => (
                <div
                  key={point.title}
                  className="p-6 rounded-[var(--radius)] border border-border bg-card hover:border-muted transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 size-8 flex items-center justify-center rounded-full bg-accent/10 text-accent text-sm font-mono">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">
                        {point.title}
                      </h4>
                      <p className="text-sm text-muted leading-relaxed">
                        {point.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tech stack */}
          <div>
            <h3 className="text-2xl font-semibold mb-8">Tech Stack</h3>
            <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="text-left text-sm font-medium text-muted px-6 py-4">
                      Layer
                    </th>
                    <th className="text-left text-sm font-medium text-muted px-6 py-4">
                      Technology
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {techStack.map((item, index) => (
                    <tr
                      key={item.layer}
                      className={`
                        border-b border-border last:border-0
                        ${index % 2 === 0 ? "bg-background" : "bg-card/50"}
                      `}
                    >
                      <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                        {item.layer}
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        {item.tech}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Code structure preview */}
            <div className="mt-6 p-6 rounded-[var(--radius)] border border-border bg-card font-mono text-sm">
              <pre className="text-muted-foreground overflow-x-auto">
{`electron/
  main/       # App entry, windows, protocols
  ipc/        # One handler per domain
  services/   # Business logic
  db/         # SQLite migrations

src/
  panels/     # One directory per UI panel
  store/      # Zustand state
  plugins/    # Plugin registry
  components/ # Shared UI primitives`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
