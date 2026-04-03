use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::RegistryError;

#[derive(Accounts)]
#[instruction(session_id: u64, project_hash: [u8; 32], agent_count: u8, models_used: [u8; 4])]
pub struct StartSession<'info> {
    #[account(
        init,
        payer = authority,
        space = AgentSession::LEN,
        seeds = [b"session", authority.key().as_ref(), &session_id.to_le_bytes()],
        bump,
    )]
    pub session: Account<'info, AgentSession>,

    #[account(
        mut,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub profile: Account<'info, DeveloperProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<StartSession>,
    session_id: u64,
    project_hash: [u8; 32],
    agent_count: u8,
    models_used: [u8; 4],
) -> Result<()> {
    let session = &mut ctx.accounts.session;
    session.authority = ctx.accounts.authority.key();
    session.session_id = session_id;
    session.project_hash = project_hash;
    session.agent_count = agent_count;
    session.models_used = models_used;
    session.tools_merkle_root = [0u8; MERKLE_ROOT_LEN];
    session.start_time = Clock::get()?.unix_timestamp;
    session.end_time = 0;
    session.status = SESSION_STATUS_ACTIVE;
    session.lines_generated = 0;
    session.bump = ctx.bumps.session;

    let profile = &mut ctx.accounts.profile;
    profile.total_sessions = profile.total_sessions
        .checked_add(1)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    profile.total_agents_spawned = profile.total_agents_spawned
        .checked_add(agent_count as u64)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    Ok(())
}
