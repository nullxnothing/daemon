/**
 * DAEMON Lite stub for EmailTools (swapped in by vite.lite.config.ts).
 * Lite has no email integration; this severs the nodemailer / imapflow /
 * mailparser chain from the Lite bundle. Only the two context helpers are
 * imported by the Lite graph (providers/contextUtils.ts).
 */
export async function getEmailAccountSummary(): Promise<string> {
  return ''
}

export const EMAIL_TOOL_NAMES = ''
