"use client";

import Image from "next/image";
import { ArrowRight, Download, Github } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Subtle radial gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0a0a0a] via-black to-black" />
      
      {/* Floating logo */}
      <div className="relative z-10 animate-float">
        <div className="relative w-48 h-48 md:w-64 md:h-64 glow rounded-full">
          <Image
            src="/images/daemon-logo.png"
            alt="Daemon Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mt-12 text-center max-w-4xl">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
          <span className="gradient-text">DAEMON</span>
        </h1>
        
        <p className="mt-6 text-xl md:text-2xl text-muted max-w-2xl mx-auto leading-relaxed text-balance">
          The AI-native IDE built for the future of development.
          Not a fork. Purpose-built from scratch.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/nullxnothing/daemon/releases"
            className="group flex items-center gap-3 bg-foreground text-background px-8 py-4 rounded-[var(--radius)] font-medium text-lg transition-all hover:bg-muted hover:scale-105"
          >
            <Download className="size-5" />
            Download for Free
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </a>
          
          <a
            href="https://github.com/nullxnothing/daemon"
            className="flex items-center gap-3 border border-border px-8 py-4 rounded-[var(--radius)] font-medium text-lg text-muted transition-all hover:border-muted hover:text-foreground hover:bg-card"
          >
            <Github className="size-5" />
            View on GitHub
          </a>
        </div>

        {/* Tech badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
          {["Electron", "React", "Monaco", "TypeScript", "MIT License"].map((tech) => (
            <span
              key={tech}
              className="px-4 py-2 text-sm text-muted-foreground border border-border-subtle rounded-full"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted-foreground rounded-full flex items-start justify-center p-2">
          <div className="w-1 h-2 bg-muted-foreground rounded-full" />
        </div>
      </div>
    </section>
  );
}
