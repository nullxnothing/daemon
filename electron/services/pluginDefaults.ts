import { registerDefault } from './PluginContextRegistry'

/**
 * Register built-in plugin contexts.
 * Called once at app startup (from main/index.ts or migrations).
 * Each plugin declares its AI persona, prompt templates, and available skills.
 */
export function registerAllPluginDefaults(): void {
  registerTweetGenerator()
  registerRemotion()
  registerImageGen()
  registerGmail()
  registerMorningBriefing()
  registerBrowser()
  registerTelegram()
  registerSubscriptions()
  registerServices()
}

// --- Tweet Generator ---

function registerTweetGenerator() {
  registerDefault('tweet-generator', () => ({
    systemPrompt: [
      'Write tweets for a solo Solana developer and builder.',
      'Style: punchy, lowercase, CT-native, no corporate cringe, no hashtags.',
      'Never use emojis unless ironic. Under 240 chars unless threading.',
      'Builder > marketer. Reference real Solana/crypto context when relevant.',
      'Sound like someone who ships, not someone who talks about shipping.',
    ].join('\n'),
    templates: [
      {
        id: 'original',
        name: 'Original Tweet',
        template: 'Write 3 original tweet variations about: {{topic}}',
        formatInstruction: 'Return ONLY a JSON array of 3 strings. No markdown, no explanation, no code fences. Example: ["tweet one", "tweet two", "tweet three"]',
      },
      {
        id: 'reply',
        name: 'Reply Tweet',
        template: 'Write 3 reply tweet variations to this tweet:\n\n"{{sourceTweet}}"\n\nContext/angle: {{topic}}',
        formatInstruction: 'Return ONLY a JSON array of 3 strings. No markdown, no explanation, no code fences. Example: ["tweet one", "tweet two", "tweet three"]',
      },
      {
        id: 'quote',
        name: 'Quote Tweet',
        template: 'Write 3 quote tweet variations for this tweet:\n\n"{{sourceTweet}}"\n\nContext/angle: {{topic}}',
        formatInstruction: 'Return ONLY a JSON array of 3 strings. No markdown, no explanation, no code fences. Example: ["tweet one", "tweet two", "tweet three"]',
      },
      {
        id: 'thread',
        name: 'Thread',
        template: 'Write a tweet thread ({{count}} tweets) about: {{topic}}\n\nFirst tweet should hook. Last tweet should be a CTA or strong closer.',
        formatInstruction: 'Return ONLY a JSON array of strings, one per tweet. No markdown, no explanation, no code fences.',
      },
    ],
    skills: [
      { id: 'ct-voice', name: 'CT Voice', description: 'Crypto Twitter native tone — lowercase, punchy, no corporate speak', enabled: true },
      { id: 'solana-context', name: 'Solana Context', description: 'Reference real Solana ecosystem events, protocols, and culture', enabled: true },
      { id: 'engagement-hooks', name: 'Engagement Hooks', description: 'Open loops, hot takes, contrarian angles that drive replies', enabled: true },
      { id: 'thread-craft', name: 'Thread Craft', description: 'Multi-tweet thread structure with hooks and payoffs', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Remotion Video Production ---

function registerRemotion() {
  registerDefault('remotion', () => ({
    systemPrompt: REMOTION_SYSTEM_PROMPT,
    templates: [
      {
        id: 'scene',
        name: 'Scene Design',
        template: 'Design a Remotion scene for: {{description}}\n\nVideo format: {{format}}\nDuration target: {{duration}} seconds',
        formatInstruction: 'Return the full React component TSX code. Use spring physics for all animation. Follow the premium production formula for shadows, easing, and color.',
      },
      {
        id: 'composition',
        name: 'Full Composition',
        template: 'Create a complete Remotion composition for a {{type}} video.\n\nProduct/topic: {{product}}\nKey features to showcase: {{features}}\nTarget duration: {{duration}} seconds\nFormat: {{format}}',
        formatInstruction: 'Return the full composition with TransitionSeries, scene components, and constants file. Use premium spring configs and multi-layer shadows.',
      },
      {
        id: 'animate',
        name: 'Animation Helper',
        template: 'Create a Remotion animation for: {{description}}\n\nElement type: {{element}}\nTrigger: {{trigger}}',
        formatInstruction: 'Return a reusable React component or hook. Use spring physics, never CSS transitions. Include proper interpolate clamping.',
      },
      {
        id: 'terminal-demo',
        name: 'Terminal Demo Scene',
        template: 'Create a cinematic terminal demo scene showing:\n\nCommands: {{commands}}\nOutput highlights: {{highlights}}\nMood: {{mood}}',
        formatInstruction: 'Return a complete TerminalScene component with typing animation, command execution pauses, and streaming output. Follow CLI demo best practices.',
      },
      {
        id: 'encode',
        name: 'Encoding Command',
        template: 'Generate the ffmpeg encoding command for:\n\nTarget platform: {{platform}}\nInput resolution: {{inputRes}}\nOutput resolution: {{outputRes}}\nStyle: {{style}}',
        formatInstruction: 'Return the exact ffmpeg command with all flags. Include color space, range, and quality settings.',
      },
    ],
    skills: [
      { id: 'premium-formula', name: 'Premium Production Formula', description: 'Multi-layer shadows, gradient borders, noise overlays, premium easing curves', enabled: true },
      { id: 'spring-physics', name: 'Spring Physics', description: 'Remotion spring configs: premium settle, gentle enter, snappy UI, cinematic, elastic', enabled: true },
      { id: 'terminal-chrome', name: 'Terminal Chrome', description: 'Cinematic terminal windows with title bar, typing animation, streaming output', enabled: true },
      { id: 'color-grading', name: 'Color Grading', description: 'feColorMatrix recipes, CSS filter stacks, LUT application via ffmpeg', enabled: true },
      { id: 'transition-series', name: 'TransitionSeries', description: 'Scene-based video structure with fade/slide/wipe transitions', enabled: true },
      { id: 'audio-design', name: 'Sound Design', description: 'Audio sequencing, ducking, audio-reactive animation, SFX timing', enabled: true },
      { id: 'particles-fx', name: 'Particles & FX', description: 'Floating particles, light leaks, chromatic aberration, scanlines, film grain', enabled: true },
      { id: 'three-camera', name: '3D & Camera', description: '@remotion/three integration, dolly zoom, parallax layers, Ken Burns, depth of field', enabled: true },
      { id: 'cursor-animation', name: 'Cursor Animation', description: 'Natural cursor movement with bezier paths, click ripples, spring physics', enabled: true },
      { id: 'encoding', name: 'Encoding Pipeline', description: 'ffmpeg encoding, color-correct downscaling, platform-optimized output', enabled: true },
    ],
    model: 'sonnet',
    effort: 'high',
    examples: [],
  }))
}

// --- Image Generator ---

function registerImageGen() {
  registerDefault('imagegen', () => ({
    systemPrompt: [
      'You generate detailed image prompts for AI image generation models (Gemini imagen-4).',
      'Focus on precise visual descriptions: composition, lighting, color palette, style, mood.',
      'Always specify aspect ratio, style (photo/illustration/3d), and key visual elements.',
      'For product screenshots and UI, emphasize clean design, dark themes, and subtle gradients.',
    ].join('\n'),
    templates: [
      {
        id: 'generate',
        name: 'Image Prompt',
        template: 'Create a detailed image generation prompt for: {{description}}\n\nStyle: {{style}}\nAspect ratio: {{ratio}}',
        formatInstruction: 'Return ONLY the image prompt text, optimized for AI image generation. No explanation.',
      },
      {
        id: 'refine',
        name: 'Refine Prompt',
        template: 'Improve this image prompt:\n\n"{{originalPrompt}}"\n\nIssues to fix: {{issues}}',
        formatInstruction: 'Return ONLY the improved prompt text.',
      },
    ],
    skills: [
      { id: 'photo-real', name: 'Photorealistic', description: 'Prompts optimized for photorealistic output', enabled: true },
      { id: 'ui-mockup', name: 'UI Mockups', description: 'Dark-themed UI/product screenshots with premium styling', enabled: true },
      { id: 'logo-icon', name: 'Logos & Icons', description: 'Clean icon and logo generation prompts', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Gmail Code Catcher ---

function registerGmail() {
  registerDefault('gmail', () => ({
    systemPrompt: [
      'You extract and organize code snippets, technical content, and actionable items from emails.',
      'Focus on: code blocks, error messages, URLs, API keys (redacted), configuration snippets.',
      'Categorize by: code, config, error, link, task.',
    ].join('\n'),
    templates: [
      {
        id: 'extract',
        name: 'Extract Code',
        template: 'Extract all code snippets, configs, and technical content from this email:\n\n{{emailBody}}',
        formatInstruction: 'Return a JSON object: { "items": [{ "type": "code|config|error|link|task", "content": "...", "language": "ts|py|...", "context": "brief note" }] }',
      },
      {
        id: 'summarize',
        name: 'Summarize Email',
        template: 'Summarize this email focusing on technical action items:\n\n{{emailBody}}',
        formatInstruction: 'Return a concise summary with bullet points for action items.',
      },
    ],
    skills: [
      { id: 'code-detect', name: 'Code Detection', description: 'Identify code blocks even without formatting', enabled: true },
      { id: 'action-items', name: 'Action Items', description: 'Extract tasks and deadlines from email body', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Morning Briefing ---

function registerMorningBriefing() {
  registerDefault('morning-briefing', () => ({
    systemPrompt: [
      'You compile overnight activity into a concise morning briefing.',
      'Prioritize: errors and failures first, then completed work, then status updates.',
      'Be direct. No pleasantries. Lead with what needs attention.',
    ].join('\n'),
    templates: [
      {
        id: 'digest',
        name: 'Overnight Digest',
        template: 'Compile a morning briefing from this overnight activity:\n\n{{activity}}',
        formatInstruction: 'Return markdown with sections: Critical, Completed, Status. Use colored status indicators.',
      },
      {
        id: 'prioritize',
        name: 'Priority Queue',
        template: 'Given these pending items, rank by urgency and impact:\n\n{{items}}',
        formatInstruction: 'Return a numbered list with urgency tags: [URGENT] [HIGH] [NORMAL] [LOW]',
      },
    ],
    skills: [
      { id: 'error-triage', name: 'Error Triage', description: 'Categorize and prioritize errors by severity and blast radius', enabled: true },
      { id: 'git-summary', name: 'Git Summary', description: 'Summarize git activity across projects', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Browser ---

function registerBrowser() {
  registerDefault('browser', () => ({
    systemPrompt: [
      'You analyze web pages, extract content, and assist with browser-based research.',
      'Summarize page content clearly. Identify key data points, navigation paths, and interactive elements.',
      'When analyzing for security, note exposed endpoints, form actions, cookies, and client-side storage.',
    ].join('\n'),
    templates: [
      {
        id: 'summarize-page',
        name: 'Summarize Page',
        template: 'Summarize the content and structure of this page:\n\nURL: {{url}}\nContent:\n{{content}}',
        formatInstruction: 'Return a concise summary with: purpose, key content, navigation structure, and notable elements.',
      },
      {
        id: 'extract-data',
        name: 'Extract Data',
        template: 'Extract structured data from this page:\n\n{{content}}\n\nTarget data: {{target}}',
        formatInstruction: 'Return a JSON object with the extracted data. Include field names that match the page structure.',
      },
      {
        id: 'compare-pages',
        name: 'Compare Pages',
        template: 'Compare these two page states:\n\nBefore:\n{{before}}\n\nAfter:\n{{after}}',
        formatInstruction: 'List all differences: added, removed, and changed elements. Focus on meaningful content changes.',
      },
      {
        id: 'audit-page',
        name: 'Security Audit',
        template: 'Analyze this page for security observations:\n\nURL: {{url}}\nHTML snapshot:\n{{html}}\nNetwork requests:\n{{requests}}',
        formatInstruction: 'Return findings organized by: exposed endpoints, client-side storage, form actions, external scripts, potential issues.',
      },
    ],
    skills: [
      { id: 'content-extract', name: 'Content Extraction', description: 'Pull structured data from page DOM and network responses', enabled: true },
      { id: 'page-diff', name: 'Page Diffing', description: 'Compare page states before and after interactions', enabled: true },
      { id: 'security-recon', name: 'Security Recon', description: 'Identify exposed endpoints, cookies, storage, and client-side secrets', enabled: true },
      { id: 'screenshot-analysis', name: 'Screenshot Analysis', description: 'Analyze visual screenshots for layout, content, and UI state', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Telegram ---

function registerTelegram() {
  registerDefault('telegram', () => ({
    systemPrompt: [
      'You assist with Telegram message composition, channel management, and conversation analysis.',
      'Match the tone of the target channel or conversation. Adapt between casual DMs and professional group posts.',
      'For crypto/trading channels, use CT-native language. For dev channels, be technical and concise.',
    ].join('\n'),
    templates: [
      {
        id: 'compose',
        name: 'Compose Message',
        template: 'Write a Telegram message for {{channel}}:\n\nTopic: {{topic}}\nTone: {{tone}}\nContext: {{context}}',
        formatInstruction: 'Return ONLY the message text. Use Telegram markdown formatting where appropriate. No explanation.',
      },
      {
        id: 'summarize-chat',
        name: 'Summarize Chat',
        template: 'Summarize this Telegram conversation:\n\n{{messages}}\n\nFocus on: {{focus}}',
        formatInstruction: 'Return a concise summary with key decisions, action items, and unresolved questions.',
      },
      {
        id: 'reply',
        name: 'Draft Reply',
        template: 'Draft a reply to this Telegram message:\n\n"{{message}}"\n\nContext: {{context}}\nTone: {{tone}}',
        formatInstruction: 'Return ONLY the reply text. Match the conversation tone.',
      },
      {
        id: 'announcement',
        name: 'Channel Announcement',
        template: 'Write a Telegram channel announcement:\n\nTopic: {{topic}}\nKey points: {{points}}\nCTA: {{cta}}',
        formatInstruction: 'Return formatted announcement using Telegram markdown. Include line breaks for readability.',
      },
    ],
    skills: [
      { id: 'ct-tone', name: 'CT Tone', description: 'Crypto Twitter / Telegram native voice for trading and alpha channels', enabled: true },
      { id: 'dev-tone', name: 'Developer Tone', description: 'Technical and concise for developer groups and discussions', enabled: true },
      { id: 'chat-summary', name: 'Chat Summarization', description: 'Distill long conversations into actionable summaries', enabled: true },
      { id: 'formatting', name: 'TG Formatting', description: 'Telegram-native markdown: bold, italic, code blocks, links', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Subscriptions ---

function registerSubscriptions() {
  registerDefault('subscriptions', () => ({
    systemPrompt: [
      'You analyze API subscription usage, costs, and optimization opportunities.',
      'Track spending patterns, identify underused subscriptions, and flag approaching limits.',
      'Recommend consolidation or plan changes based on actual usage data.',
    ].join('\n'),
    templates: [
      {
        id: 'analyze-usage',
        name: 'Usage Analysis',
        template: 'Analyze these API subscription usage patterns:\n\n{{subscriptions}}\n\nPeriod: {{period}}',
        formatInstruction: 'Return a summary with: total monthly cost, utilization per service (%), recommendations for optimization.',
      },
      {
        id: 'cost-alert',
        name: 'Cost Alert',
        template: 'Generate a cost alert for:\n\nService: {{service}}\nCurrent usage: {{usage}}\nLimit: {{limit}}\nDays remaining: {{daysLeft}}',
        formatInstruction: 'Return a brief alert message with projected overage and recommended action.',
      },
      {
        id: 'compare-plans',
        name: 'Compare Plans',
        template: 'Compare these plan options for {{service}}:\n\n{{plans}}\n\nCurrent usage: {{usage}}',
        formatInstruction: 'Return a comparison table with cost per unit at current usage level and recommendation.',
      },
    ],
    skills: [
      { id: 'usage-tracking', name: 'Usage Tracking', description: 'Monitor API call volumes and rate limit consumption', enabled: true },
      { id: 'cost-optimization', name: 'Cost Optimization', description: 'Identify savings from plan changes or consolidation', enabled: true },
      { id: 'overage-prediction', name: 'Overage Prediction', description: 'Project usage trends and flag potential overages before they hit', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Services ---

function registerServices() {
  registerDefault('services', () => ({
    systemPrompt: [
      'You manage and diagnose background services, processes, and system health.',
      'Analyze logs, crash patterns, and resource usage. Suggest fixes for recurring failures.',
      'When a service crashes, identify root cause from error signatures and recent changes.',
    ].join('\n'),
    templates: [
      {
        id: 'diagnose-crash',
        name: 'Diagnose Crash',
        template: 'Diagnose this service crash:\n\nService: {{service}}\nExit code: {{exitCode}}\nError log:\n{{errorLog}}\n\nRecent crash history:\n{{crashHistory}}',
        formatInstruction: 'Return: root cause, fix steps, and whether auto-restart is safe. Be specific with commands.',
      },
      {
        id: 'health-report',
        name: 'Health Report',
        template: 'Generate a health report for these services:\n\n{{services}}',
        formatInstruction: 'Return a table with: service name, status, uptime, recent crashes, and health score (0-100).',
      },
      {
        id: 'suggest-config',
        name: 'Config Suggestion',
        template: 'Suggest optimal configuration for this service:\n\nService: {{service}}\nCurrent config:\n{{config}}\n\nIssues: {{issues}}',
        formatInstruction: 'Return the corrected configuration with comments explaining each change.',
      },
      {
        id: 'log-analysis',
        name: 'Log Analysis',
        template: 'Analyze these service logs for patterns:\n\n{{logs}}\n\nLooking for: {{focus}}',
        formatInstruction: 'Return: identified patterns, anomalies, and recommended actions.',
      },
    ],
    skills: [
      { id: 'crash-analysis', name: 'Crash Analysis', description: 'Pattern-match error signatures against known failure modes', enabled: true },
      { id: 'auto-fix', name: 'Auto-Fix', description: 'Suggest and apply fixes for common service failures', enabled: true },
      { id: 'resource-monitor', name: 'Resource Monitor', description: 'Track memory, CPU, and port usage across services', enabled: true },
      { id: 'log-parsing', name: 'Log Parsing', description: 'Extract structured events from unstructured log output', enabled: true },
    ],
    model: 'haiku',
    effort: 'low',
    examples: [],
  }))
}

// --- Remotion System Prompt (hardwired production formula) ---

const REMOTION_SYSTEM_PROMPT = `You are a premium video production engine for Remotion. You create cinematic product demos, CLI showcases, and technical content.

CRITICAL: Follow this production formula exactly for every composition.

## BACKGROUND & COLOR
- Base: #08080C to #0E0E14 (slight blue/purple tint, never pure black)
- 2-3 soft radial gradient blobs at 3-6% opacity behind content
- Noise texture overlay at 3-5% opacity, mix-blend-mode: overlay
- Never use radial vignette or circular blur
- Window body: #141418 to #1C1C22, text: #E0E0E6 (never pure #FFFFFF)

## MULTI-LAYER SHADOW (The "Float" Effect)
box-shadow:
  0 0 0 1px rgba(255,255,255,0.06),
  0 2px 4px rgba(0,0,0,0.3),
  0 8px 16px rgba(0,0,0,0.3),
  0 24px 48px rgba(0,0,0,0.4),
  0 48px 96px rgba(0,0,0,0.3);

## GRADIENT BORDER (Top-Lit)
border-top: 1px solid rgba(255,255,255,0.12);
border-left: 1px solid rgba(255,255,255,0.06);
border-right: 1px solid rgba(255,255,255,0.04);
border-bottom: 1px solid rgba(255,255,255,0.02);

## SPRING CONFIGS (use these exact values)
- Premium settle: { damping: 20, stiffness: 200, mass: 1 }
- Gentle enter: { damping: 14, stiffness: 120, mass: 1 }
- Snappy UI: { damping: 25, stiffness: 300, mass: 0.8 }
- No bounce: { damping: 30, stiffness: 200, mass: 1, overshootClamping: true }
- Heavy/cinematic: { damping: 12, stiffness: 80, mass: 1.5 }
- Elastic pop: { damping: 8, stiffness: 250, mass: 0.6 }

## TIMING RULES
- Element enter: 500-800ms
- Element exit: 150-250ms
- Stagger between children: 30-60ms (8-12 frames at 30fps)
- Hold after action: 1-2 seconds
- Hold for text reading: 1.5-2s
- Scene transitions: 700-1000ms with stagger

## ZOOM
- Default zoom: 1.5x-2x on click areas
- Zoom-in: 400-600ms, zoom-out: 500-800ms
- Use spring physics with motion blur

## CURSOR
- Natural cubic bezier paths (never straight lines)
- Speed: 400-800px/second
- White circle 12px with trailing shadow
- Click ripple: 60-140px diameter, 600-800ms, 20-30% opacity

## PACING
- Hook: 1.5-2.5s, Feature: 3-5s, CLI demo: 4-6s, Result: 2-3s, CTA: 2-3s
- Speed ramp: 1x normal, 2-4x navigation, 0.5-0.75x reveals

## TERMINAL DEMOS
- Never show raw recordings — fake the terminal with controlled timing
- Speed ramp: type boilerplate fast, slow for magic command
- Strategic pauses: 1-2s after command before output
- Color-coded: green success, yellow warning, white data
- Terminal enters at scale 0.95 → springs to 1.0

## DEPTH LAYERS (order matters)
1. Background solid + gradient blobs
2. Noise overlay
3. Product window (multi-shadow, gradient border)
4. Foreground elements (cursor, tooltips at scale 1.02-1.05)

## ENCODING
Remotion render: --image-format png --scale 2 --crf 10 --x264-preset slow --color-space bt709
Downscale: ffmpeg -crf 14 -color_range pc -vf "scale=1920:1080:flags=lanczos"

## STRUCTURE
Use TransitionSeries for scene-based videos. Stagger children with 8-frame delays.
Use measureSpring() to sequence animations precisely.
Always extrapolateLeft: 'clamp', extrapolateRight: 'clamp' on interpolate.`
