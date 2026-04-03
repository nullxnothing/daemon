use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::RegistryError;

#[derive(Accounts)]
#[instruction(project_hash: [u8; 32], duration_secs: u64)]
pub struct RegisterProject<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = ProjectRecord::LEN,
        seeds = [b"project", authority.key().as_ref(), &project_hash],
        bump,
    )]
    pub project: Account<'info, ProjectRecord>,

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
    ctx: Context<RegisterProject>,
    project_hash: [u8; 32],
    duration_secs: u64,
) -> Result<()> {
    let project = &mut ctx.accounts.project;
    let is_new = project.session_count == 0 && project.authority == Pubkey::default();

    project.authority = ctx.accounts.authority.key();
    project.project_hash = project_hash;
    project.session_count = project.session_count
        .checked_add(1)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    project.total_duration_secs = project.total_duration_secs
        .checked_add(duration_secs)
        .ok_or(RegistryError::ArithmeticOverflow)?;
    project.last_session_at = Clock::get()?.unix_timestamp;
    project.bump = ctx.bumps.project;

    if is_new {
        let profile = &mut ctx.accounts.profile;
        profile.projects_count = profile.projects_count
            .checked_add(1)
            .ok_or(RegistryError::ArithmeticOverflow)?;
    }

    Ok(())
}
