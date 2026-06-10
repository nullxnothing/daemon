/**
 * One-off verification: materialize the trading-bot scaffold into a temp dir,
 * install real deps, and typecheck the generated project so kit/zod API usage
 * is validated against actual package types (transpile tests only catch syntax).
 * Run: node scripts/verify-trading-bot-scaffold.mts   (Node 23+, native type stripping)
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { tradingBotFiles } from '../src/panels/ProjectStarter/tradingBotScaffold.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-bot-verify-'))

const packageJson = {
  name: 'bot-verify',
  version: '0.1.0',
  private: true,
  type: 'module',
  dependencies: {
    '@solana/kit': '^2.3.0',
    dotenv: '^16.4.7',
    pino: '^9.7.0',
    zod: '^3.25.0',
  },
  devDependencies: {
    '@types/node': '^22.10.0',
    typescript: '^5.9.0',
  },
}

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: 'dist',
    lib: ['ES2022', 'DOM'],
  },
  include: ['src'],
}

fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(packageJson, null, 2))
fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
fs.mkdirSync(path.join(root, 'src'), { recursive: true })
for (const file of tradingBotFiles()) {
  fs.writeFileSync(path.join(root, file.path), file.content)
}

console.log(`scaffold written to ${root}`)
execSync('pnpm install --ignore-workspace --reporter=silent', { cwd: root, stdio: 'inherit' })
execSync('pnpm exec tsc --noEmit', { cwd: root, stdio: 'inherit' })
console.log('generated trading bot typechecks clean')
fs.rmSync(root, { recursive: true, force: true })
