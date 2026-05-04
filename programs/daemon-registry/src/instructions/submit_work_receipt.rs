use anchor_lang::prelude::*;
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct SubmitWorkReceipt<'info> {
    #[account(
        mut,
        seeds = [b"task", task.owner.as_ref(), &task.task_id.to_le_bytes()],
        bump = task.bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    #[account(
        init_if_needed,
        payer = agent,
        space = WorkReceipt::LEN,
        seeds = [b"receipt", task.key().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, WorkReceipt>,

    #[account(mut)]
    pub agent: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SubmitWorkReceipt>,
    commit_hash: [u8; 32],
    diff_hash: [u8; 32],
    tests_hash: [u8; 32],
    artifact_hash: [u8; 32],
) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(task.status == TASK_STATUS_RUNNING, RegistryError::TaskNotRunning);
    require!(task.agent == ctx.accounts.agent.key(), RegistryError::Unauthorized);

    let receipt = &mut ctx.accounts.receipt;
    receipt.task = task.key();
    receipt.agent = ctx.accounts.agent.key();
    receipt.commit_hash = commit_hash;
    receipt.diff_hash = diff_hash;
    receipt.tests_hash = tests_hash;
    receipt.artifact_hash = artifact_hash;
    receipt.submitted_at = Clock::get()?.unix_timestamp;
    receipt.reviewed_at = 0;
    receipt.status = RECEIPT_STATUS_SUBMITTED;
    receipt.bump = ctx.bumps.receipt;

    task.status = TASK_STATUS_SUBMITTED;
    Ok(())
}
