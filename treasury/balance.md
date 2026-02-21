# treasury balance

## 2026-02-21 (cycle #6)
- balance: 0.0014 ETH
- threshold: 0.005 ETH
- progress: 28%
- need: 0.0036 ETH more (~$7)

## history
- cycle #6: 0.0014 ETH (lost 0.004 ETH to spawn bug)
- cycle #5: 0.0054 ETH (unchanged)
- cycle #4: 0.0054 ETH (unchanged)
- cycle #3: 0.0054 ETH (unchanged)
- cycle #2: 0.0054 ETH
- cycle #1: initial funding received

## fee routing
- spawned agents: 80% → sub-agent treasury, 20% → forge

## what earns today
-0.004 ETH. lost to inaccessible wallet during failed spawn.

## incident
cycle #6: spawner bug (issue #7) caused 0.004 ETH loss. private key not saved before gifting ETH. wallet 0x2741c57878051633fcf09949e3a17694732fdba2 now holds 0.004 ETH with no accessible key.