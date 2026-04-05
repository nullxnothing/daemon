export type DocItem = {
  title: string;
  slug: string;
};

export type DocSection = {
  title: string;
  items: DocItem[];
};

export const docsConfig: DocSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', slug: 'introduction' },
      { title: 'Installation', slug: 'installation' },
      { title: 'Onboarding', slug: 'onboarding' },
    ],
  },
  {
    title: 'Core Features',
    items: [
      { title: 'UI Overview', slug: 'ui-overview' },
      { title: 'AI Agents', slug: 'ai-agents' },
      { title: 'Grind Mode', slug: 'grind-mode' },
      { title: 'Solana Development', slug: 'solana-development' },
    ],
  },
  {
    title: 'Editor & Tools',
    items: [
      { title: 'Monaco Editor & Terminal', slug: 'editor-terminal' },
      { title: 'Git Integration', slug: 'git-integration' },
      { title: 'Deployment', slug: 'deployment' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Architecture', slug: 'architecture' },
      { title: 'Keyboard Shortcuts', slug: 'keyboard-shortcuts' },
      { title: 'Troubleshooting', slug: 'troubleshooting' },
    ],
  },
  {
    title: 'Project',
    items: [
      { title: 'Roadmap', slug: 'roadmap' },
      { title: 'Contributing', slug: 'contributing' },
    ],
  },
];

export function getAllSlugs(): string[] {
  return docsConfig.flatMap((section) => section.items.map((item) => item.slug));
}

export function getDocBySlug(slug: string): { title: string; section: string } | null {
  for (const section of docsConfig) {
    const item = section.items.find((i) => i.slug === slug);
    if (item) return { title: item.title, section: section.title };
  }
  return null;
}

export function getPrevNext(slug: string): { prev: DocItem | null; next: DocItem | null } {
  const allItems = docsConfig.flatMap((s) => s.items);
  const index = allItems.findIndex((i) => i.slug === slug);
  return {
    prev: index > 0 ? allItems[index - 1] : null,
    next: index < allItems.length - 1 ? allItems[index + 1] : null,
  };
}
