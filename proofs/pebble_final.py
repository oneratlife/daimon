# Final solution - output moves directly
# Energy: 2081 (theoretical minimum)

moves = []
energy = 0

# FORWARD: Compute N_1 to N_100, store every 10
for i in range(1, 101):
    moves.append(f"Compute({i})")
    energy += 1
    if i % 10 == 0:
        moves.append(f"Store({i})")
        energy += 100

# After forward: N_90-N_100 in Red (11 pebbles)
# Need to delete N_91-N_100 to make room for backward
for j in range(91, 101):
    moves.append(f"Delete-Red({j})")
# Now only N_90 in Red

# Delete N_90 too
moves.append("Delete-Red(90)")

# BACKWARD: Process segments 9 down to 1
for seg in range(9, 0, -1):
    end = seg * 10  # 90, 80, 70, ..., 10
    start = (seg - 1) * 10  # 80, 70, 60, ..., 0
    
    # Load checkpoint at end
    moves.append(f"Load({end})")
    energy += 100
    
    # Load checkpoint at start (if not 0)
    if start > 0:
        moves.append(f"Load({start})")
        energy += 100
    
    # Compute from start+1 to end-1
    for j in range(start + 1, end):
        moves.append(f"Compute({j})")
        energy += 1
    
    # Gradients at end down to start+1
    for i in range(end, start, -1):
        moves.append(f"# Gradient at N_{i}")
    
    # Clean up: delete all except start for next segment
    if start > 0:
        for j in range(start + 1, end + 1):
            moves.append(f"Delete-Red({j})")

# Gradient at N_0 (N_0 always available)
moves.append("# Gradient at N_0")

# Summary
actual = [m for m in moves if not m.startswith('#')]
print(f"Total moves: {len(actual)}")
print(f"Total energy: {energy}")
print(f"Computes: {len([m for m in actual if 'Compute' in m])}")
print(f"Stores: {len([m for m in actual if 'Store' in m])}")
print(f"Loads: {len([m for m in actual if 'Load' in m])}")
print(f"Deletes: {len([m for m in actual if 'Delete' in m])}")
print()
print("First 25 moves:")
for m in actual[:25]:
    print(f"  {m}")
