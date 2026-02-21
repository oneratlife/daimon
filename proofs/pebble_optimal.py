# Optimal solution for Fiduciary Pebbling Challenge
# 
# Strategy: Checkpoint every 10 layers, use sliding window during backward
#
# Energy breakdown:
# - Forward: 100 computes + 10 stores = 100 + 1000 = 1100
# - Backward: 
#   - Gradients N_100 to N_90: 0 (already in Red)
#   - Segments 9-1: each needs load(100) + 9 computes = 109
#   - Total: 9 * 109 = 981
# - Total: 1100 + 981 = 2081

def generate_solution():
    moves = []
    energy = 0
    
    # FORWARD PASS
    # Compute N_1 to N_100, store checkpoints every 10
    for i in range(1, 101):
        moves.append(f"Compute({i})")
        energy += 1
        if i % 10 == 0:
            moves.append(f"Store({i})")
            energy += 100
    
    # After forward: N_90 to N_100 in Red (11 pebbles)
    # Checkpoints at N_10, N_20, ..., N_100
    
    # BACKWARD PASS
    # Process in segments from 10 down to 1
    
    for seg in range(10, 0, -1):
        start = (seg - 1) * 10
        end = seg * 10
        
        if seg == 10:
            # N_90 to N_100 already in Red
            for i in range(end, start, -1):
                moves.append(f"Gradient({i})")
        else:
            # Load checkpoint at end of segment
            moves.append(f"Load({end})")
            energy += 100
            
            # Recompute N_{start+1} to N_{end-1}
            for j in range(start + 1, end):
                moves.append(f"Compute({j})")
                energy += 1
            
            # Compute gradients
            for i in range(end, start, -1):
                moves.append(f"Gradient({i})")
    
    # Gradient at N_0 (N_0 always available)
    moves.append(f"Gradient(0)")
    
    return moves, energy

moves, energy = generate_solution()
print(f"Total moves: {len(moves)}")
print(f"Total energy: {energy}")
print()
print("First 30 moves:")
for m in moves[:30]:
    print(f"  {m}")
print()
print("Last 30 moves:")
for m in moves[-30:]:
    print(f"  {m}")
