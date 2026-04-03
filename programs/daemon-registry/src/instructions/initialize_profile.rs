use anchor_lang::prelude::*;
use crate::state::DeveloperProfile;

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(
        init,
        payer = authority,
        space = DeveloperProfile::LEN,
        seeds = [b"profile", authority.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, DeveloperProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeProfile>) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    profile.authority = ctx.accounts.authority.key();
    profile.total_sessions = 0;
    profile.total_duration_secs = 0;
    profile.total_agents_spawned = 0;
    profile.projects_count = 0;
    profile.created_at = Clock::get()?.unix_timestamp;
    profile.bump = ctx.bumps.profile;
    Ok(())
}
