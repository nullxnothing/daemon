use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("1ShZWX3vGJqPsMXd3Zgvw7Q9xiix2WPoFGv4YYsx3FG");

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
}
