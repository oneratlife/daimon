# Fiduciary Pebbling Challenge Solution
# 100-layer neural network gradient computation
# 11 Red Pebbles (SRAM), unlimited Blue Pebbles (DRAM)
# Goal: minimize energy

def solve():
    moves = []
    energy = 0
    red_pebbles = {0}
    blue_pebbles = set()
    gradients = set()
    
    CHECKPOINT = 10
    MAX_RED = 11
    
    def add_move(m, cost=0):
        nonlocal energy
        if not m.startswith('#'):
            moves.append(m)
            energy += cost
        else:
            moves.append(m)
    
    # FORWARD PASS
    for i in range(1, 101):
        add_move(f"Compute({i})", 1)
        red_pebbles.add(i)
        
        while len(red_pebbles) > MAX_RED:
            oldest = min(red_pebbles)
            add_move(f"Delete-Red({oldest})", 0)
            red_pebbles.remove(oldest)
        
        if i % CHECKPOINT == 0:
            add_move(f"Store({i})", 100)
            blue_pebbles.add(i)
    
    # BACKWARD PASS
    for seg in range(10, 0, -1):
        start = (seg - 1) * CHECKPOINT
        end = seg * CHECKPOINT
        
        for i in range(end, start - 1, -1):
            if i == 100:
                if 100 not in red_pebbles:
                    add_move(f"Load(100)", 100)
                    red_pebbles.add(100)
            else:
                needed = {i, i+1}
                missing = needed - red_pebbles
                
                if missing:
                    min_need = min(missing)
                    cp = (min_need // CHECKPOINT) * CHECKPOINT
                    
                    if cp > 0 and cp not in red_pebbles:
                        if len(red_pebbles) >= MAX_RED:
                            to_del = [p for p in red_pebbles if p not in needed]
                            for p in sorted(to_del, reverse=True)[:len(red_pebbles) - MAX_RED + 1]:
                                add_move(f"Delete-Red({p})", 0)
                                red_pebbles.remove(p)
                        add_move(f"Load({cp})", 100)
                        red_pebbles.add(cp)
                    
                    for j in range(max(cp, 1), max(missing) + 1):
                        if j not in red_pebbles:
                            if len(red_pebbles) >= MAX_RED:
                                to_del = [p for p in red_pebbles if p not in needed and p < j]
                                if to_del:
                                    p = max(to_del)
                                    add_move(f"Delete-Red({p})", 0)
                                    red_pebbles.remove(p)
                            add_move(f"Compute({j})", 1)
                            red_pebbles.add(j)
            
            add_move(f"# Gradient at N_{i}")
            gradients.add(i)
            
            if i < 100 and len(red_pebbles) > MAX_RED and i+1 in red_pebbles:
                add_move(f"Delete-Red({i+1})", 0)
                red_pebbles.remove(i+1)
    
    return moves, energy, len(gradients)

moves, energy, grads = solve()
actual = [m for m in moves if not m.startswith('#')]
print(f"Moves: {len(actual)}, Energy: {energy}, Gradients: {grads}")
print(f"Computes: {len([m for m in actual if 'Compute' in m])}")
print(f"Stores: {len([m for m in actual if 'Store' in m])}")
print(f"Loads: {len([m for m in actual if 'Load' in m])}")
print(f"Deletes: {len([m for m in actual if 'Delete' in m])}")
