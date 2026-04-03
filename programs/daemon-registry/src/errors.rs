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
}
