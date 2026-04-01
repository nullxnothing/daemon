"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Download, Github, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Architecture", href: "#architecture" },
  { label: "Roadmap", href: "#roadmap" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3">
            <Image
              src="/images/daemon-logo.png"
              alt="Daemon"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-lg font-bold">Daemon</span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="https://github.com/nullxnothing/daemon"
              className="text-muted hover:text-foreground transition-colors"
            >
              <Github className="size-5" />
            </a>
            <a
              href="https://github.com/nullxnothing/daemon/releases"
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all hover:bg-muted"
            >
              <Download className="size-4" />
              Download
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-foreground"
          >
            {isMobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-muted hover:text-foreground transition-colors py-2"
                >
                  {link.label}
                </a>
              ))}
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <a
                  href="https://github.com/nullxnothing/daemon"
                  className="text-muted hover:text-foreground transition-colors"
                >
                  <Github className="size-5" />
                </a>
                <a
                  href="https://github.com/nullxnothing/daemon/releases"
                  className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium"
                >
                  <Download className="size-4" />
                  Download
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
