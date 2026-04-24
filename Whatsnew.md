# DAEMON v2.0.22

- DAEMON now reads the real Solana runtime behind the active project instead of relying on frontend guesses.
- Added environment diagnostics for Solana CLI, Anchor, AVM, Surfpool, and LiteSVM with direct install and docs actions from the Toolbox.
- Improved local validator guidance with recommended startup paths, clearer fallback behavior, and surfaced startup errors.
- Tightened wallet transfer UX so tracked internal recipients fall back cleanly to custom destinations when the address is edited.
- Added test coverage for runtime diagnostics, guided install flows, and wallet destination fallback behavior.
