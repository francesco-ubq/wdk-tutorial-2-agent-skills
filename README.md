# Giving an AI agent a wallet — the exact commands

Companion repo for the lesson **"Give your agent a wallet: Tether WDK agent skills + the WDK
CLI"**. Everything the video shows was run for real; this is the transcript of it, in order, so
you can repeat it.

The wallet used on camera is a throwaway funded with a few dollars. **Nothing in this repo
contains a seed phrase, a private key or a passphrase, and none of the commands below print
one.** That is deliberate and it is the point of the exercise — see [Safety](#safety).

---

## 1. Install the skill

A skill is a folder: a `SKILL.md` plus whatever reference pages it needs. **Where that folder
goes depends on the kind of thing you are running**, not on the vendor.

```bash
git clone --depth 1 https://github.com/tetherto/wdk-docs /tmp/wdk-docs
# every route below copies /tmp/wdk-docs/skills/wdk somewhere
```

### A terminal agent — you copy the folder in

| tool | project scope | personal scope |
| --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/skills) | `.claude/skills/` | `~/.claude/skills/` |
| [Codex](https://learn.chatgpt.com/docs/build-skills) | `.agents/skills/` | `~/.agents/skills/` |

```bash
mkdir -p .claude/skills && cp -R /tmp/wdk-docs/skills/wdk .claude/skills/wdk   # Claude Code
mkdir -p .agents/skills && cp -R /tmp/wdk-docs/skills/wdk .agents/skills/wdk   # Codex
```

Project scope is checked in with the repo; the `~` version applies to every project you open.
Nothing registers it — the tool watches those folders.

### An editor — the same move, a different folder

| tool | project scope | personal scope |
| --- | --- | --- |
| [VS Code / Copilot](https://code.visualstudio.com/docs/agent-customization/agent-skills) | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| [Windsurf Cascade](https://docs.devin.ai/desktop/cascade/skills) | `.devin/skills/` (`.windsurf/skills/` legacy) | `~/.codeium/windsurf/skills/` |

VS Code reads **all three** project folders, so a repo that already has `.claude/skills/` needs
no second copy.

### An agent runtime — you install it, from a registry

OpenClaw is not an editor. It is an agent runtime with its own registry (ClawHub), so here you
do not copy anything:

```bash
openclaw skills install @tether-skills/tether-wdk    # lands in ~/.agents/skills/
```

What you end up with, whichever route you took:

```
skills/wdk/
├── SKILL.md          17 KB
└── references/       15 files
    ├── chains.md  wallet-evm.md  wallet-btc.md  wallet-spark.md  …
    └── protocol-swap.md  protocol-bridge.md  protocol-swidge.md  protocol-lending.md
```

## 2. Run an agent with only that skill enabled

`agent.py` is a Claude Code session built with the Python Agent SDK, with every default made
explicit so it matches what you get by typing `claude`.

```bash
uv init
uv add claude-agent-sdk
uv run agent.py "Read the Arbitrum balances for account 0, quote a 1 USDt0 transfer, and send nothing."
```

The options that matter:

```python
options = ClaudeAgentOptions(
    system_prompt={"type": "preset", "preset": "claude_code"},
    tools={"type": "preset", "preset": "claude_code"},
    setting_sources=["user", "project", "local"],   # this is what reads .claude/skills off disk
    skills=["wdk"],                                  # and this leaves only the WDK skill enabled
    cwd=str(LAB),
)
```

`setting_sources` is the line people miss: without it the SDK never looks at `.claude/skills/`
and the skill is simply absent.

---

## 3. Check balances

### With the WDK CLI

```bash
npm i -g @tetherto/wdk-cli
wdk --version

# create a wallet. this PRINTS A SEED PHRASE — discard the stream, never filter it afterwards
wdk wallet create --wallet lessondemo >/dev/null 2>&1
wdk wallet list

wdk get address --network arbitrum --wallet lessondemo
wdk get balance --all --wallet lessondemo
wdk get balance --network arbitrum --wallet lessondemo
wdk get balance --network arbitrum --token usdt0 --wallet lessondemo
```

### With the SDK, in a script

```bash
cd scripts
npm install
SEED_FILE=/path/to/seed node wallet.js
```

`wallet.js` derives account 0 on Ethereum, Arbitrum, Bitcoin and Tron from one seed, reads the
Arbitrum ETH and USDt0 balances, and quotes a transfer **without sending it**.

---

## 4. Dry-run a send before you mean it

```bash
wdk send --network arbitrum --to 0xRECIPIENT --amount 0.0001 \
         --wallet lessondemo --dry-run
```

and in the SDK, `quoteTransfer()` is the read-only twin of `transfer()`:

```js
const quote = await account.quoteTransfer({ token: USDT0, recipient, amount })
console.log(quote.fee)      // nothing has been signed
```

---

## 5. Do the real transfer

The one in the video is a **self-transfer**: the recipient is the wallet's own address, so the
tokens come back and the only real cost is gas. `scripts/selftransfer.js` refuses to run if the
recipient is anything else.

```bash
SEED_FILE=/path/to/seed node scripts/selftransfer.js
```

Output from the run in the video:

```
Account 0 on Arbitrum One
  0x91044B4b4399AcBFfAaB630f34A033ECbb2a863d

Before
  ETH    0.0002
  USDt0  4

Quote: 0.1 USDt0 -> self
  estimated fee  0.000001625153476 ETH

Sent
  tx hash  0x02ab13034f0d379b3fe5c21ce6ffcb996cb2de5be7a7e947f0df5f342d28557f

Confirmed
  status      success
  block       512118086
  gas used    37038
  fee paid    0.00000074076 ETH
  explorer    https://arbiscan.io/tx/0x02ab13034f0d379b3fe5c21ce6ffcb996cb2de5be7a7e947f0df5f342d28557f

After
  USDt0  4  (unchanged — it paid itself)
```

---

## 6. Check the transaction and open the explorer

Straight from the chain, no explorer needed:

```bash
TX=0x02ab13034f0d379b3fe5c21ce6ffcb996cb2de5be7a7e947f0df5f342d28557f

curl -s https://arb1.arbitrum.io/rpc \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$TX\"]}" \
  | jq '{status: .result.status, block: .result.blockNumber, gasUsed: .result.gasUsed}'
```

`status: "0x1"` is success. Then open it:

```bash
open "https://arbiscan.io/tx/$TX"        # macOS
xdg-open "https://arbiscan.io/tx/$TX"    # Linux
```

`scripts/check-tx.sh` wraps both steps.

---

## 7. What else the skill covers

A transfer is the simple one. The same account object also quotes:

| protocol | method | reference page |
| --- | --- | --- |
| swap | `quoteSwap()` | `protocol-swap.md` |
| bridge | `quoteBridge()` | `protocol-bridge.md` |
| swidge (both in one call) | `quoteSwidge()` | `protocol-swidge.md` |
| lending — supply, borrow, repay, withdraw | `quoteSupply()`, `quoteBorrow()`, `quoteRepay()`, `quoteWithdraw()` | `protocol-lending.md` |

And it is not only EVM: `wallet-btc`, `wallet-solana`, `wallet-tron`, `wallet-ton`,
`wallet-aptos` and `wallet-spark` (lightning) are all in the same 15 reference pages, off the
same seed. **Every write has a quote twin**, so an agent can price anything before it asks you.

## 8. Letting an agent drive the CLI

By default the lab's `.claude/settings.json` does not allow `Bash(wdk:*)`, so an agent asked to
run `wdk` is blocked and — correctly — will not edit the settings to unblock itself. To let it
drive the CLI, allow the subcommands you actually want, and deny the one that prints a seed phrase.

```json
{
  "permissions": {
    "allow": ["Bash(wdk get:*)", "Bash(wdk wallet list:*)", "Bash(wdk send:*)"],
    "deny":  ["Bash(wdk wallet create:*)", "Bash(wdk wallet export:*)"]
  }
}
```

`wdk wallet create` writes the seed phrase to stdout, which would put it in the transcript — so
it stays denied even when everything else is allowed.

## Safety

The lesson's own subject is a self-custodial SDK, so leaking a key while demonstrating it would
contradict the whole thing. The rules used throughout:

- **`wdk wallet create` prints the seed phrase to stdout.** Discard that stream with
  `>/dev/null 2>&1` rather than filtering it afterwards — a filter that misses once has already
  leaked.
- The seed lives in a file outside the repo, passed as `SEED_FILE`, read inside one expression
  and never logged, echoed or copied.
- `account.keyPair` is sensitive. Never print it. Call `dispose()` on every account and on the
  WDK instance when you are done, which clears key material from memory.
- Addresses and transaction hashes are **public** — those are safe to show, and this repo does.
- Quote first. `quoteTransfer()` and `--dry-run` cost nothing and tell you the fee before
  anything is signed.
- Scope any script that can spend: `selftransfer.js` asserts the recipient equals the sender and
  exits otherwise.

## What is in here

```
scripts/
├── wallet.js         read balances on 4 chains from 1 seed, quote a transfer, send nothing
├── selftransfer.js   the real confirmed transfer — recipient is asserted to be the sender
├── check-tx.sh       poll the receipt from the RPC, then open the explorer
└── package.json      the exact WDK package versions used on camera
```

## Links

- WDK docs and the skill itself — https://github.com/tetherto/wdk-docs
- WDK site — https://wdk.tether.io
- The skill on ClawHub — https://clawhub.ai/tether-skills/skills/tether-wdk
- Claude Code skills — https://code.claude.com/docs/en/skills
- OpenClaw skills — https://docs.openclaw.ai/tools/skills

---

## A note on the Agent SDK section

Section 7 below documents the Python Agent SDK harness (`uv init`, `uv add claude-agent-sdk`, the
`ClaudeAgentOptions` block). **That is how the demo was filmed, not something you need.** It is
kept here because this repo is the record of what was actually run, but it was deliberately cut
from the video: the skill is installed as a folder and used by whatever agent you already have,
and the harness dates faster than anything else.

If you want to reproduce the captures yourself, section 7 is the way. If you just want to use the
skill, stop at section 3.
