use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::RegistryError;

#[derive(Accounts)]
pub struct EndSession<'info> {
    #[account(
        mut,
        seeds = [b"session", authority.key().as_ref(), &session.session_id.to_le_bytes()],
        bump = session.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub session: Account<'info, AgentSession>,

    #[account(
        mut,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub profile: Account<'info, DeveloperProfile>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<EndSession>,
    tools_merkle_root: [u8; 32],
    lines_generated: u32,
) -> Result<()> {
    let session = &mut ctx.accounts.session;
    require!(session.status == SESSION_STATUS_ACTIVE, RegistryError::SessionNotActive);

    let now = Clock::get()?.unix_timestamp;
    let duration = (now - session.start_time) as u64;

    session.end_time = now;
    session.tools_merkle_root = tools_merkle_root;
    session.lines_generated = lines_generated;
    session.status = SESSION_STATUS_COMPLETED;

    let profile = &mut ctx.accounts.profile;
    profile.total_duration_secs = profile.total_duration_secs
        .checked_add(duration)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    Ok(())
}
