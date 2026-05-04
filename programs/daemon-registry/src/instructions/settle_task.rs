use anchor_lang::prelude::*;
use crate::errors::RegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct SettleTask<'info> {
    #[account(
        mut,
        seeds = [b"task", task.owner.as_ref(), &task.task_id.to_le_bytes()],
        bump = task.bump,
    )]
    pub task: Account<'info, TaskEscrow>,

    #[account(mut, address = task.owner @ RegistryError::Unauthorized)]
    pub owner: SystemAccount<'info>,

    #[account(mut, address = task.agent @ RegistryError::Unauthorized)]
    pub agent: SystemAccount<'info>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SettleTask>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(task.status != TASK_STATUS_SETTLED, RegistryError::TaskAlreadySettled);
    require!(
        task.status == TASK_STATUS_APPROVED || task.status == TASK_STATUS_REJECTED,
        RegistryError::TaskNotReviewed
    );

    let signer = ctx.accounts.authority.key();
    require!(
        signer == task.owner || signer == task.verifier || signer == task.agent,
        RegistryError::Unauthorized
    );

    let amount = task.bounty_lamports;
    require!(amount > 0, RegistryError::InvalidBounty);

    let task_info = task.to_account_info();
    let recipient_info = if task.status == TASK_STATUS_APPROVED {
        ctx.accounts.agent.to_account_info()
    } else {
        ctx.accounts.owner.to_account_info()
    };

    **task_info.try_borrow_mut_lamports()? = task_info
        .lamports()
        .checked_sub(amount)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    **recipient_info.try_borrow_mut_lamports()? = recipient_info
        .lamports()
        .checked_add(amount)
        .ok_or(RegistryError::ArithmeticOverflow)?;

    task.bounty_lamports = 0;
    task.status = TASK_STATUS_SETTLED;
    Ok(())
}
