# @node-i3x/core

## 0.3.2 (2026-06-13)

- fix: QRY-08 historian support + subscription cleanup
- feat: add TypeService to prewarm object types
- fix: flush seeded values synchronously on register
- fix: seed initial values on subscription register
- feat: SUB-07/SUB-13 sync acknowledgement with lastSequenceNumber
- feat: add configurable BrowseFilter for object visibility
- fix(EXP-13): assign typeElementId to all nodes
- feat: generate JSON Schema for ObjectType responses (QRY-03)
- fix(SUB-14): close existing SSE stream when second opens
- fix(EXP-14): unique type elementIds via full browse-path hierarchy
- fix(QRY-02): composite assets with null value use quality GoodNoData
- fix(QRY-05): treat maxDepth=0 as infinite depth for component reads
- fix(SUB-08): report failure when unregistering unknown elementId
- fix: resolve i3X conformance failures EXP-14, SUB-09, SUB-14
- fix(QRY-04/QRY-09): add responseDetail to failed bulk items in value and history endpoints
- fix: support maxDepth=1 semantics on value queries and map null quality to GoodNoData
- fix: resolve object typeElementId using mapped types list and fallback to UnknownType
- fix: fallback elementId construction to sourceNodeId for uniqueness
- chore: add response compression plugin @fastify/compress

## 0.3.1 (2026-06-10)

- feat: gate debug logs behind DEBUG env var, widen VHS demo, rename repo refs to node-i3x

## 0.3.0 (2026-06-10)

- chore: rename repo  to node-i3x

## 0.2.4 (2026-06-10)

- chore: upgrade all dependencies (TS6, vitest 4, node-opcua 2.173)
- fix: monorepo hygiene - licenses, publishConfig, tsconfig, gitignore

## 0.2.3 (2026-06-10)

- Version bump

## 0.2.2 (2026-06-10)

- fix: release workflow OIDC permissions and GitHub release idempotency

## 0.2.1 (2026-06-10)

- Version bump

