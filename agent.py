"""A Claude Code environment, 1:1, with the WDK agent skill installed.

Everything Claude Code gives you interactively is turned on explicitly here, so the
session the SDK runs is the same session you would get by typing `claude` in this
directory:

  system_prompt   preset "claude_code"  -> Claude Code's own system prompt
  tools           preset "claude_code"  -> Read/Write/Edit/Bash/Glob/Grep/WebFetch/...
  setting_sources user+project+local    -> CLAUDE.md, .claude/settings.json, .claude/skills/
  skills          ["wdk"]               -> only the Tether WDK skill is left enabled

The skill itself is just .claude/skills/wdk/SKILL.md plus references/ — the exact files
from github.com/tetherto/wdk-docs. Nothing about WDK is in this script.

  uv run agent.py            # the default read-only wallet task
  uv run agent.py "..."      # your own prompt
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    SystemMessage,
    query,
)

HERE = Path(__file__).parent
WORKSPACE = HERE / "workspace"

# Read-only on purpose. The skill's own security section says every write method —
# sendTransaction, transfer, sign, swap, bridge, supply — needs explicit human
# confirmation, so an unattended run like this one must not reach for any of them.
TASK = """\
Build a small Node.js script in ./workspace called wallet.js using the Tether WDK.

The seed phrase comes from the file named by the SEED_FILE environment variable. Read it,
never print it, never copy it anywhere. The script must:
  1. derive account 0 on Ethereum, Arbitrum, Bitcoin and Tron, and print each address
  2. read the native ETH balance of the Arbitrum account
  3. read its USDt0 token balance
  4. quote (never send) the fee of a 1 USDt0 transfer on Arbitrum to account index 1
  5. dispose of every account and wallet in a finally block

Use the public RPCs the skill documents. Do not send any transaction and do not sign
anything. Then run it with node and show me the output.
"""


SKILLS = ["wdk"]


# The banner reports what the session actually is, not what was asked for. `skills=["wdk"]` is
# a context FILTER, not a sandbox: setting_sources still discovers every skill on disk, and the
# SDK then hides all but the listed ones from the model's listing and rejects them at the Skill
# tool. Printing both numbers keeps the captured frame honest about that distinction.
def banner(cwd: Path, enabled: list[str], discovered: int) -> None:
    rows = [
        "Claude Agent SDK · Claude Code preset",
        "cwd: %s" % cwd.name,
        "skill enabled: %s" % (", ".join(enabled) or "(none)"),
        "discovered on disk: %d, filtered out: %d" % (discovered, max(discovered - len(enabled), 0)),
    ]
    O, R = "\x1b[38;5;208m", "\x1b[0m"
    print(f"{O}╭──────────────────────────────────────────────────────────╮{R}")
    for row in rows:
        print(f"{O}│{R}  %-54s {O}│{R}" % row)
    print(f"{O}╰──────────────────────────────────────────────────────────╯{R}")


async def main() -> None:
    prompt = sys.argv[1] if len(sys.argv) > 1 else TASK
    WORKSPACE.mkdir(exist_ok=True)

    options = ClaudeAgentOptions(
        cwd=str(HERE),
        # the same system prompt and tool set the `claude` CLI runs with
        system_prompt={"type": "preset", "preset": "claude_code"},
        tools={"type": "preset", "preset": "claude_code"},
        # load CLAUDE.md, .claude/settings.json and .claude/skills/ from disk
        setting_sources=["user", "project", "local"],
        # ...of which exactly one skill is left enabled for the model
        skills=SKILLS,
        permission_mode="acceptEdits",
        model="claude-sonnet-5-5",
    )

    transcript: list[dict] = []
    t0 = time.monotonic()

    def log(kind: str, **fields) -> None:
        transcript.append({"t": round(time.monotonic() - t0, 3), "kind": kind, **fields})

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, SystemMessage) and message.subtype == "init":
            loaded = message.data.get("skills", [])
            names = [s.get("name", s) if isinstance(s, dict) else s for s in loaded]
            enabled = [n for n in names if str(n) in SKILLS]
            banner(HERE, enabled or ["(not discovered)"], len(names))
            log("init", skills=names, enabled=enabled, model=message.data.get("model"))

        elif isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text") and block.text.strip():
                    print("\x1b[97m%s\x1b[0m" % block.text.strip())
                    log("text", text=block.text.strip())
                elif hasattr(block, "name"):
                    arg = block.input or {}
                    detail = (
                        arg.get("command")
                        or arg.get("file_path")
                        or arg.get("skill")
                        or arg.get("pattern")
                        or arg.get("url")
                        or ""
                    )
                    # Paths print relative to the lab, the way Claude Code shows them — an
                    # absolute path eats the column and hides the filename that matters.
                    detail = str(detail).replace(str(HERE) + "/", "")
                    print("\x1b[38;5;208m● %s\x1b[0m\x1b[90m(%s)\x1b[0m" % (block.name, detail[:90]))
                    # the transcript keeps the detail untruncated; the video does its own eliding
                    log("tool", tool=block.name, detail=detail)

        elif isinstance(message, ResultMessage):
            print(
                "\x1b[90m─ %s · %d turns · %.1fs · $%.4f\x1b[0m"
                % (message.subtype, message.num_turns, message.duration_ms / 1000, message.total_cost_usd or 0)
            )
            log(
                "result",
                subtype=message.subtype,
                turns=message.num_turns,
                seconds=round(message.duration_ms / 1000, 1),
                cost_usd=message.total_cost_usd,
            )

    out = HERE / "transcripts" / ("run-%s.json" % time.strftime("%Y%m%d-%H%M%S"))
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(transcript, indent=2))
    print("\x1b[90mtranscript: %s\x1b[0m" % out.relative_to(HERE))


if __name__ == "__main__":
    # Either an API key or the credentials the `claude` CLI already holds on this machine.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("\x1b[90mno ANTHROPIC_API_KEY; using the local Claude Code credentials\x1b[0m")
    asyncio.run(main())
