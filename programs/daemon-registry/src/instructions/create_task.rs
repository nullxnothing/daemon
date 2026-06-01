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

    // Verifier and agent must be real, distinct parties. A zeroed verifier would
    // brick approval; a zeroed agent would brick the task; verifier == agent
    // would let the worker approve their own work. (Owner-as-verifier stays
    // allowed — approve_work/reject_work intentionally accept the owner.)
    require!(task_parties_valid(&verifier, &agent), RegistryError::InvalidTaskParty);

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

/// Returns true when verifier and agent are both set (non-default) and distinct.
/// Pure helper so the escrow-party invariant is unit-testable without a validator.
pub fn task_parties_valid(verifier: &Pubkey, agent: &Pubkey) -> bool {
    *verifier != Pubkey::default() && *agent != Pubkey::default() && verifier != agent
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(byte: u8) -> Pubkey {
        Pubkey::new_from_array([byte; 32])
    }

    #[test]
    fn accepts_distinct_nonzero_parties() {
        assert!(task_parties_valid(&key(1), &key(2)));
    }

    #[test]
    fn rejects_zeroed_verifier() {
        assert!(!task_parties_valid(&Pubkey::default(), &key(2)));
    }

    #[test]
    fn rejects_zeroed_agent() {
        assert!(!task_parties_valid(&key(1), &Pubkey::default()));
    }

    #[test]
    fn rejects_verifier_equals_agent() {
        assert!(!task_parties_valid(&key(3), &key(3)));
    }
}
