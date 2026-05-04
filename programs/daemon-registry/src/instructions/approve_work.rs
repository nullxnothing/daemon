use anchor_lang::prelude::*;
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct ApproveWork<'info> {
    #[account(
        mut,
        seeds = [b"task", task.owner.as_ref(), &task.task_id.to_le_bytes()],
        bump = task.bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    #[account(
        mut,
        seeds = [b"receipt", task.key().as_ref()],
        bump = receipt.bump,
    )]
    pub receipt: Account<'info, WorkReceipt>,

    pub verifier: Signer<'info>,
}

pub fn handler(ctx: Context<ApproveWork>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(task.status == TASK_STATUS_SUBMITTED, RegistryError::TaskNotSubmitted);

    let signer = ctx.accounts.verifier.key();
    require!(signer == task.verifier || signer == task.owner, RegistryError::Unauthorized);

    let receipt = &mut ctx.accounts.receipt;
    require!(receipt.task == task.key(), RegistryError::Unauthorized);
    receipt.status = RECEIPT_STATUS_APPROVED;
    receipt.reviewed_at = Clock::get()?.unix_timestamp;

    task.status = TASK_STATUS_APPROVED;
    Ok(())
}
