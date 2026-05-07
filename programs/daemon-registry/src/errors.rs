use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Session is already active")]
    SessionAlreadyActive,

    #[msg("Session is not active")]
    SessionNotActive,

    #[msg("Unauthorized: signer does not match authority")]
    Unauthorized,

    #[msg("Invalid project hash: must be 32 bytes")]
    InvalidProjectHash,

    #[msg("Developer profile already exists")]
    ProfileAlreadyExists,

    #[msg("Session must be completed before closing")]
    SessionNotCompleted,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid bounty: task escrow requires a funded bounty")]
    InvalidBounty,

    #[msg("Invalid deadline: deadline must be in the future")]
    InvalidDeadline,

    #[msg("Task is not open")]
    TaskNotOpen,

    #[msg("Task is not running")]
    TaskNotRunning,

    #[msg("Task has no submitted work receipt")]
    TaskNotSubmitted,

    #[msg("Task is not approved or rejected")]
    TaskNotReviewed,

    #[msg("Task is already settled")]
    TaskAlreadySettled,

    #[msg("Task cannot be expired in its current state")]
    TaskNotExpirable,

    #[msg("Invalid agent count: must be between 1 and the session model capacity")]
    InvalidAgentCount,
}
