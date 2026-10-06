#!/usr/bin/env bash
# Read a transaction receipt straight from the Arbitrum RPC, then open it on Arbiscan.
# Transaction hashes are public — there is nothing sensitive in here.
set -euo pipefail

TX="${1:-}"
if [[ -z "$TX" ]]; then
  echo "usage: $0 <tx-hash>" >&2
  exit 1
fi

RPC="${ARBITRUM_RPC:-https://arb1.arbitrum.io/rpc}"

echo "Receipt for $TX"
curl -s "$RPC" \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$TX\"]}" \
  | jq '{
      status:  (if .result.status == "0x1" then "success" else "FAILED" end),
      block:   (.result.blockNumber | ltrimstr("0x") | explode | implode),
      gasUsed: (.result.gasUsed     | ltrimstr("0x")),
      from:    .result.from,
      to:      .result.to
    }'

URL="https://arbiscan.io/tx/$TX"
echo
echo "Explorer: $URL"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
fi
