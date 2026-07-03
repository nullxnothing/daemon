#!/usr/bin/env bash
# Retries the devnet faucet for the spike's throwaway key, then fires autorun.
PUB="4bfCqhwmNoX44FGGTTQ89HbQj2vWzJZfLTd8GPUiXeS9"
cd "$(dirname "$0")"
for i in $(seq 1 12); do
  BAL=$(solana balance "$PUB" -u devnet 2>/dev/null | grep -oE '^[0-9.]+')
  if [ -n "$BAL" ] && [ "$(echo "$BAL > 0.01" | bc)" = "1" ]; then
    echo "[retry-airdrop] funded: $BAL SOL — running autorun"
    bash autorun.sh > out/autorun.log 2>&1
    exit 0
  fi
  solana airdrop 1 "$PUB" -u devnet >/dev/null 2>&1 && continue
  sleep 1800
done
echo "[retry-airdrop] gave up after 12 rounds (~6h); key still unfunded"
exit 1
