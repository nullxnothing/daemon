type SolanaToolingGuideId = SolanaEnvironmentDiagnosticItem['id']

export interface SolanaToolingGuide {
  docsUrl: string
  docsLabel: string
  installCommand?: string
  installLabel?: string
}

interface SolanaToolingGuideOptions {
  avmInstalled?: boolean
  hasProject?: boolean
}

export function getSolanaToolingGuide(
  id: SolanaToolingGuideId,
  options: SolanaToolingGuideOptions = {},
): SolanaToolingGuide {
  switch (id) {
    case 'solana-cli':
      return {
        docsUrl: 'https://solana.com/docs/intro/installation',
        docsLabel: 'Open Solana CLI docs',
      }
    case 'anchor':
      return {
        docsUrl: 'https://www.anchor-lang.com/docs/installation',
        docsLabel: 'Open Anchor docs',
        installCommand: options.avmInstalled ? 'avm install latest; avm use latest' : undefined,
        installLabel: options.avmInstalled ? 'Install Anchor in terminal' : undefined,
      }
    case 'avm':
      return {
        docsUrl: 'https://www.anchor-lang.com/docs/avm',
        docsLabel: 'Open AVM docs',
        installCommand: 'cargo install --git https://github.com/coral-xyz/anchor avm --locked --force',
        installLabel: 'Install AVM in terminal',
      }
    case 'surfpool':
      return {
        docsUrl: 'https://docs.surfpool.run/',
        docsLabel: 'Open Surfpool docs',
        installCommand: 'cargo install surfpool',
        installLabel: 'Install Surfpool in terminal',
      }
    case 'litesvm':
      return {
        docsUrl: 'https://www.anchor-lang.com/docs/testing/litesvm',
        docsLabel: 'Open LiteSVM docs',
        installCommand: options.hasProject ? 'pnpm add -D @lite-svm/js' : undefined,
        installLabel: options.hasProject ? 'Add LiteSVM in terminal' : undefined,
      }
  }
}
