use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::RegistryError;

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"session", authority.key().as_ref(), &session.session_id.to_le_bytes()],
        bump = session.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub session: Account<'info, AgentSession>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<CloseSession>) -> Result<()> {
    require!(
        ctx.accounts.session.status == SESSION_STATUS_COMPLETED,
        RegistryError::SessionNotCompleted
    );
    Ok(())
}
