import Image from "next/image";
import { Github } from "lucide-react";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Architecture", href: "#architecture" },
      { label: "Roadmap", href: "#roadmap" },
      { label: "Download", href: "https://github.com/nullxnothing/daemon/releases" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "https://github.com/nullxnothing/daemon#readme" },
      { label: "Contributing", href: "https://github.com/nullxnothing/daemon/blob/main/CONTRIBUTING.md" },
      { label: "Changelog", href: "https://github.com/nullxnothing/daemon/releases" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/nullxnothing/daemon" },
      { label: "Issues", href: "https://github.com/nullxnothing/daemon/issues" },
      { label: "Discussions", href: "https://github.com/nullxnothing/daemon/discussions" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <Image
                src="/images/daemon-logo.png"
                alt="Daemon"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <span className="text-xl font-bold">Daemon</span>
            </div>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              The AI-native IDE built for the future of development.
            </p>
            <a
              href="https://github.com/nullxnothing/daemon"
              className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-4" />
              nullxnothing/daemon
            </a>
          </div>

          {/* Links */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="font-medium text-foreground mb-4">{group.title}</h4>
              <ul className="flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Daemon. MIT License.
          </p>
          <p className="text-sm text-muted-foreground">
            Made with care by{" "}
            <a
              href="https://github.com/nullxnothing"
              className="text-muted hover:text-foreground transition-colors"
            >
              nullxnothing
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
