"use client";

import { Download, Github, ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Main CTA */}
        <h2 className="text-4xl md:text-6xl font-bold gradient-text text-balance">
          Ready to build the future?
        </h2>
        <p className="mt-6 text-xl text-muted max-w-2xl mx-auto leading-relaxed">
          Download Daemon and experience AI-native development.
          Free, open source, and built for developers.
        </p>

        {/* Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/nullxnothing/daemon/releases"
            className="group flex items-center gap-3 bg-foreground text-background px-8 py-4 rounded-[var(--radius)] font-medium text-lg transition-all hover:bg-muted hover:scale-105"
          >
            <Download className="size-5" />
            Download Now
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </a>
          
          <a
            href="https://github.com/nullxnothing/daemon"
            className="flex items-center gap-3 border border-border px-8 py-4 rounded-[var(--radius)] font-medium text-lg text-muted transition-all hover:border-muted hover:text-foreground hover:bg-card"
          >
            <Github className="size-5" />
            Star on GitHub
          </a>
        </div>

        {/* Stats or social proof */}
        <div className="mt-16 pt-16 border-t border-border">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                100%
              </div>
              <div className="mt-2 text-sm text-muted">Open Source</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                MIT
              </div>
              <div className="mt-2 text-sm text-muted">Licensed</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                V1
              </div>
              <div className="mt-2 text-sm text-muted">Released</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
