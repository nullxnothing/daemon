use anchor_lang::prelude::*;
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct StartTaskSession<'info> {
    #[account(
        mut,
        seeds = [b"task", task.owner.as_ref(), &task.task_id.to_le_bytes()],
        bump = task.bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    pub agent: Signer<'info>,
}

pub fn handler(ctx: Context<StartTaskSession>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(task.status == TASK_STATUS_OPEN, RegistryError::TaskNotOpen);
    require!(task.agent == ctx.accounts.agent.key(), RegistryError::Unauthorized);
    require!(Clock::get()?.unix_timestamp <= task.deadline_ts, RegistryError::InvalidDeadline);

    task.status = TASK_STATUS_RUNNING;
    Ok(())
}
