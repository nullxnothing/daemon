use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc");

#[program]
pub mod daemon_registry {
    use super::*;

    pub fn initialize_profile(ctx: Context<InitializeProfile>) -> Result<()> {
        instructions::initialize_profile::handler(ctx)
    }

    pub fn start_session(
        ctx: Context<StartSession>,
        session_id: u64,
        project_hash: [u8; 32],
        agent_count: u8,
        models_used: [u8; 4],
    ) -> Result<()> {
        instructions::start_session::handler(ctx, session_id, project_hash, agent_count, models_used)
    }

    pub fn end_session(
        ctx: Context<EndSession>,
        tools_merkle_root: [u8; 32],
        lines_generated: u32,
    ) -> Result<()> {
        instructions::end_session::handler(ctx, tools_merkle_root, lines_generated)
    }

    pub fn register_project(
        ctx: Context<RegisterProject>,
        project_hash: [u8; 32],
        duration_secs: u64,
    ) -> Result<()> {
        instructions::register_project::handler(ctx, project_hash, duration_secs)
    }

    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        instructions::close_session::handler(ctx)
    }

    pub fn create_task(
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
        instructions::create_task::handler(
            ctx,
            task_id,
            repo_hash,
            prompt_hash,
            acceptance_hash,
            bounty_lamports,
            deadline_ts,
            verifier,
            agent,
        )
    }

    pub fn start_task_session(ctx: Context<StartTaskSession>) -> Result<()> {
        instructions::start_task_session::handler(ctx)
    }

    pub fn submit_work_receipt(
        ctx: Context<SubmitWorkReceipt>,
        commit_hash: [u8; 32],
        diff_hash: [u8; 32],
        tests_hash: [u8; 32],
        artifact_hash: [u8; 32],
    ) -> Result<()> {
        instructions::submit_work_receipt::handler(ctx, commit_hash, diff_hash, tests_hash, artifact_hash)
    }

    pub fn approve_work(ctx: Context<ApproveWork>) -> Result<()> {
        instructions::approve_work::handler(ctx)
    }

    pub fn reject_work(ctx: Context<RejectWork>) -> Result<()> {
        instructions::reject_work::handler(ctx)
    }

    pub fn settle_task(ctx: Context<SettleTask>) -> Result<()> {
        instructions::settle_task::handler(ctx)
    }
}
