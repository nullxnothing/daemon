use anchor_lang::prelude::*;
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct ExpireTask<'info> {
    #[account(
        mut,
        seeds = [b"task", task.owner.as_ref(), &task.task_id.to_le_bytes()],
        bump = task.bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    #[account(mut, address = task.owner @ RegistryError::Unauthorized)]
    pub owner: SystemAccount<'info>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<ExpireTask>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(
        task.status == TASK_STATUS_OPEN || task.status == TASK_STATUS_RUNNING,
        RegistryError::TaskNotExpirable
    );
    require!(
        Clock::get()?.unix_timestamp > task.deadline_ts,
        RegistryError::InvalidDeadline
    );

    let signer = ctx.accounts.authority.key();
    require!(
        signer == task.owner || signer == task.verifier,
        RegistryError::Unauthorized
    );

    let amount = task.bounty_lamports;
    require!(amount > 0, RegistryError::InvalidBounty);

    let task_info = task.to_account_info();
    let owner_info = ctx.accounts.owner.to_account_info();

    **task_info.try_borrow_mut_lamports()? = task_info
        .lamports()
        .checked_sub(amount)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    **owner_info.try_borrow_mut_lamports()? = owner_info
        .lamports()
        .checked_add(amount)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    task.bounty_lamports = 0;
    task.status = TASK_STATUS_SETTLED;
    Ok(())
}
