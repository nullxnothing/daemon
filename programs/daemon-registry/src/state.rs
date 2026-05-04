use anchor_lang::prelude::*;

pub const SESSION_STATUS_ACTIVE: u8 = 0;
pub const SESSION_STATUS_COMPLETED: u8 = 1;
pub const SESSION_STATUS_CANCELLED: u8 = 2;

pub const MAX_AGENTS_PER_SESSION: usize = 4;
pub const PROJECT_HASH_LEN: usize = 32;
pub const MERKLE_ROOT_LEN: usize = 32;
pub const WORK_HASH_LEN: usize = 32;

pub const TASK_STATUS_OPEN: u8 = 0;
pub const TASK_STATUS_RUNNING: u8 = 1;
pub const TASK_STATUS_SUBMITTED: u8 = 2;
pub const TASK_STATUS_APPROVED: u8 = 3;
pub const TASK_STATUS_REJECTED: u8 = 4;
pub const TASK_STATUS_SETTLED: u8 = 5;

pub const RECEIPT_STATUS_SUBMITTED: u8 = 0;
pub const RECEIPT_STATUS_APPROVED: u8 = 1;
pub const RECEIPT_STATUS_REJECTED: u8 = 2;

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

#[account]
pub struct TaskEscrow {
    pub owner: Pubkey,
    pub verifier: Pubkey,
    pub agent: Pubkey,
    pub task_id: u64,
    pub repo_hash: [u8; WORK_HASH_LEN],
    pub prompt_hash: [u8; WORK_HASH_LEN],
    pub acceptance_hash: [u8; WORK_HASH_LEN],
    pub bounty_lamports: u64,
    pub deadline_ts: i64,
    pub created_at: i64,
    pub status: u8,
    pub bump: u8,
}

impl TaskEscrow {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct WorkReceipt {
    pub task: Pubkey,
    pub agent: Pubkey,
    pub commit_hash: [u8; WORK_HASH_LEN],
    pub diff_hash: [u8; WORK_HASH_LEN],
    pub tests_hash: [u8; WORK_HASH_LEN],
    pub artifact_hash: [u8; WORK_HASH_LEN],
    pub submitted_at: i64,
    pub reviewed_at: i64,
    pub status: u8,
    pub bump: u8,
}

impl WorkReceipt {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
}
