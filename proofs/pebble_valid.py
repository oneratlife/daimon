# Valid solution for Fiduciary Pebbling Challenge
# Tracks red pebble count, ensures <= 11 at all times

def generate_valid_solution():
    moves = []
    energy = 0
    red = {0}  # N_0 starts with Red pebble
    blue = set()
    
    def do(m, cost=0):
        nonlocal energy
        moves.append(m)
        energy += cost
        return m
    
    # FORWARD PASS
    for i in range(1, 101):
        # Compute N_i
        assert i-1 in red, f"Cannot compute N_{i}"
        do(f"Compute({i})", 1)
        red.add(i)
        
        # Delete old if too many
        while len(red) > 11:
            oldest = min(red)
            do(f"Delete-Red({oldest})", 0)
            red.remove(oldest)
        
        # Store checkpoint
        if i % 10 == 0:
            do(f"Store({i})", 100)
            blue.add(i)
    
    # After forward: N_90-N_100 in red (11 pebbles)
    # Checkpoints: N_10, N_20, ..., N_100
    
    # BACKWARD PASS
    # Segment 10: N_90-N_100 already in red
    for i in range(100, 89, -1):
        do(f"# Gradient at N_{i}")
    
    # Delete N_91-N_100 to make room
    for j in range(91, 101):
        if j in red:
            do(f"Delete-Red({j})", 0)
            red.remove(j)
    
    # Now only N_90 in red
    do(f"Delete-Red(90)", 0)
    red.remove(90)
    
    # Segments 9-1
    for seg in range(9, 0, -1):
        end = seg * 10
        start = (seg - 1) * 10
        
        # Load checkpoint at end
        do(f"Load({end})", 100)
        red.add(end)
        
        # Recompute to get N_{end-1} down to N_{start+1}
        for j in range(end - 1, start, -1):
            # Actually need to compute forward from start
            pass
        
        # Better: load previous checkpoint and compute forward
        if start > 0:
            # Need to load start checkpoint
            if len(red) >= 11:
                # Delete some first
                to_del = [p for p in red if p != end]
                for p in sorted(to_del, reverse=True)[:len(red) - 10]:
                    do(f"Delete-Red({p})", 0)
                    red.remove(p)
            do(f"Load({start})", 100)
            red.add(start)
        
        # Compute forward
        for j in range(start + 1, end):
            do(f"Compute({j})", 1)
            red.add(j)
            while len(red) > 11:
                # Delete oldest that's not needed
                to_del = [p for p in red if p < j]
                if to_del:
                    oldest = min(to_del)
                    do(f"Delete-Red({oldest})", 0)
                    red.remove(oldest)
        
        # Now have N_start to N_end in red
        # Compute gradients
        for i in range(end, start, -1):
            do(f"# Gradient at N_{i}")
            # Delete N_{i+1} after gradient if too many pebbles
            if i < end and i+1 in red and len(red) > 11:
                do(f"Delete-Red({i+1})", 0)
                red.remove(i+1)
        
        # Clean up for next segment
        if start > 0:
            # Keep only start for next iteration
            to_del = [p for p in red if p != start]
            for p in to_del:
                do(f"Delete-Red({p})", 0)
                red.remove(p)
    
    # Gradient at N_0
    do(f"# Gradient at N_0")
    
    return moves, energy

try:
    moves, energy = generate_valid_solution()
    actual = [m for m in moves if not m.startswith('#')]
    print(f"Moves: {len(actual)}, Energy: {energy}")
    print(f"Computes: {len([m for m in actual if 'Compute' in m])}")
    print(f"Stores: {len([m for m in actual if 'Store' in m])}")
    print(f"Loads: {len([m for m in actual if 'Load' in m])}")
    print(f"Deletes: {len([m for m in actual if 'Delete' in m])}")
except Exception as e:
    print(f"Error: {e}")
