#!/usr/bin/env bash
# DEVNET faucets are intermittently dry. This helper polls for devnet SOL on the
# throwaway key, retrying the sanctioned faucet channels, and fires the spike the
# instant funds land. Safe to leave running. DEVNET ONLY — throwaway key only.
set -u
cd "$(dirname "$0")"
KEY=out/throwaway-devnet-key.json
[ -f "$KEY" ] || { echo "run 'node spike.mjs' once to mint the throwaway key first"; exit 1; }
PK=$(node -e "const{createUmi}=await import('@metaplex-foundation/umi-bundle-defaults');const fs=await import('node:fs');const u=createUmi('https://api.devnet.solana.com');console.log(u.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('$KEY','utf8')))).publicKey)")
echo "throwaway key: $PK"
bal() { curl -s https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$PK\"]}" | grep -o '"value":[0-9]*' | grep -o '[0-9]*$'; }
for i in $(seq 1 120); do
  b=$(bal); b=${b:-0}
  if [ "$b" -ge 100000000 ]; then echo "funded ($b lamports) — running spike"; exec node spike.mjs; fi
  curl -s https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"requestAirdrop\",\"params\":[\"$PK\",1000000000]}" >/dev/null 2>&1 || true
  devnet-pow mine -k "$KEY" -u dev -d 2 --reward 0.05 -t 200000000 >/dev/null 2>&1 || true
  sleep 60
done
echo "faucet still dry after ~2h — rerun later or fund $PK manually, then: node spike.mjs"
