# ADR 002: Browse Strategy (Breadth-First Search)

## Status
Approved

## Context
OPC UA server AddressSpaces are directed graphs, containing cycles and complex references (hierarchical and non-hierarchical).
The i3X specification represents assets and properties as a hierarchy (a tree structure).
To expose this graph as a tree, we must traverse the OPC UA node structure from designated roots and resolve a single, unique, stable browse path for every mapped node.

## Decision
We use a **Breadth-First Search (BFS)** traversal strategy starting from the roots of the address space:
1. Roots are identified as OPC UA nodes with no parent references in the discovered set.
2. Traversal propagates level-by-level using a queue.
3. For each visited node, its unique browse path is constructed by appending its qualified name segment (`nsu=URI:BrowseName`) to its parent's browse path.
4. BFS ensures that the first path discovered to any node is the shortest possible path from a root, and we record this as the canonical path.
5. If a node is reached via a longer path later, it is ignored, resolving cycles and multiple parent references deterministically.

## Consequences
- **Shortest Path Guarantees**: Browse paths are naturally kept as short as possible.
- **Deterministic Paths**: The generated hierarchy is stable and reproducible across server restarts.
- **Safe from Deep Stack Recursion**: Using a queue instead of a recursive DFS function avoids call stack overflow issues when traversing large address spaces.
- **Simplifies MaxDepth Queries**: Processing nodes level-by-level aligns perfectly with the standard i3X maxDepth query parameters used in `/objects/value` and subscription registration.
