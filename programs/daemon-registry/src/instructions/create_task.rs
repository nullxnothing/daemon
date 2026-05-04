use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = owner,
        space = TaskEscrow::LEN,
        seeds = [b"task", owner.key().as_ref(), &task_id.to_le_bytes()],
        bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateTask>,
    task_id: u64,
    repo_hash: [u8; 32],
    prompt_hash: [u8; 32],
    acceptance_hash: [u8; 32],
    bounty_lamports: u64,
    deadline_ts: i64,
    verifier: Pubkey,
    agent: Pubkey,
) -> Result<()> {
    require!(bounty_lamports > 0, RegistryError::InvalidBounty);

    let now = Clock::get()?.unix_timestamp;
    require!(deadline_ts > now, RegistryError::InvalidDeadline);

    let task = &mut ctx.accounts.task;
    task.owner = ctx.accounts.owner.key();
    task.verifier = verifier;
    task.agent = agent;
    task.task_id = task_id;
    task.repo_hash = repo_hash;
    task.prompt_hash = prompt_hash;
    task.acceptance_hash = acceptance_hash;
    task.bounty_lamports = bounty_lamports;
    task.deadline_ts = deadline_ts;
    task.created_at = now;
    task.status = TASK_STATUS_OPEN;
    task.bump = ctx.bumps.task;

    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.owner.key(),
        task.to_account_info().key,
        bounty_lamports,
    );

    invoke(
        &transfer_ix,
        &[
            ctx.accounts.owner.to_account_info(),
            task.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    Ok(())
}
