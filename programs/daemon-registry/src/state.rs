use anchor_lang::prelude::*;

pub const SESSION_STATUS_ACTIVE: u8 = 0;
pub const SESSION_STATUS_COMPLETED: u8 = 1;
pub const SESSION_STATUS_CANCELLED: u8 = 2;

pub const MAX_AGENTS_PER_SESSION: usize = 4;
pub const PROJECT_HASH_LEN: usize = 32;
pub const MERKLE_ROOT_LEN: usize = 32;

#[account]
pub struct DeveloperProfile {
    pub authority: Pubkey,
    pub total_sessions: u64,
    pub total_duration_secs: u64,
    pub total_agents_spawned: u64,
    pub projects_count: u16,
    pub created_at: i64,
    pub bump: u8,
}

impl DeveloperProfile {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 2 + 8 + 1;
}

#[account]
pub struct AgentSession {
    pub authority: Pubkey,
    pub session_id: u64,
    pub project_hash: [u8; PROJECT_HASH_LEN],
    pub agent_count: u8,
    pub models_used: [u8; MAX_AGENTS_PER_SESSION],
    pub tools_merkle_root: [u8; MERKLE_ROOT_LEN],
    pub start_time: i64,
    pub end_time: i64,
    pub status: u8,
    pub lines_generated: u32,
    pub bump: u8,
}

impl AgentSession {
    pub const LEN: usize = 8 + 32 + 8 + 32 + 1 + 4 + 32 + 8 + 8 + 1 + 4 + 1;
}

#[account]
pub struct ProjectRecord {
    pub authority: Pubkey,
    pub project_hash: [u8; PROJECT_HASH_LEN],
    pub session_count: u32,
    pub total_duration_secs: u64,
    pub last_session_at: i64,
    pub bump: u8,
}

impl ProjectRecord {
    pub const LEN: usize = 8 + 32 + 32 + 4 + 8 + 8 + 1;
}
