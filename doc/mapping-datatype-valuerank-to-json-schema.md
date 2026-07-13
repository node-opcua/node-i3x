# From `(DataType, ValueRank, ArrayDimensions)` to JSON Schema

### How node-i3x maps the OPC UA variable-shape triple onto i3X JSON Schema — and why the two models line up with (almost) no ambiguity

---

## 1. Two ways of describing the same thing

i3X and OPC UA both need to answer one deceptively simple question about a variable:

> *"What shape and what primitive type does this value have?"*

They answer it with completely different vocabularies.

**OPC UA** answers with **three orthogonal attributes** carried on every `Variable` and `VariableType` node (OPC UA Part 3, §5.6.2):

| Attribute | OPC UA type | Meaning |
|---|---|---|
| `DataType` | `NodeId` | *What* the scalar element is (a `NodeId` pointing into the DataType hierarchy: `Double`, `Int32`, `String`, a `Structure`, …) |
| `ValueRank` | `Int32` | *How many dimensions* the value has (scalar, 1-D array, matrix, …) |
| `ArrayDimensions` | `UInt32[]` | *How long* each dimension is (`0` = unknown/unbounded) |

**i3X** answers with a single **JSON Schema fragment** (RFC §5.2.2: *"Type definitions … MUST be expressed as JSON Schema"*). There is no `ValueRank`, no `ArrayDimensions` — everything about a value's shape is folded into the recursive structure of the schema:

```jsonc
{ "type": "number" }                        // a scalar Double
{ "type": "array", "items": { "type": "number" } }   // an array of Double
```

The interesting engineering question is: **is the OPC UA triple losslessly and unambiguously expressible in JSON Schema?** The answer — for the overwhelming majority of real nodes — is **yes**, and this document explains why, then closes the one genuinely ambiguous corner (`ValueRank = -2`) with a `oneOf`.

---

## 2. The OPC UA side, precisely

### 2.1 `DataType` — the element type

`DataType` is a `NodeId` into the DataType hierarchy. It describes a **single element**, never the collection. `Double`, `Int32`, `String`, `ByteString`, `DateTime`, `Guid`, `LocalizedText`, an enumeration, or a `Structure` sub-type — all of these are *element* types. The array-ness lives entirely in `ValueRank`/`ArrayDimensions`, never here.

This is the first reason the mapping is clean: **`DataType` maps to a JSON Schema *leaf*** and nothing else. It never influences nesting.

### 2.2 `ValueRank` — the dimensionality

`ValueRank` is an `Int32` with a small, closed set of meanings (OPC UA Part 3, Table — *ValueRank*):

| `ValueRank` | Symbolic name | Meaning |
|---:|---|---|
| `n > 1` | — | array with **exactly `n`** dimensions (a matrix / tensor) |
| `1` | `OneDimension` | a **one-dimensional** array |
| `0` | `OneOrMoreDimensions` | an array of **one or more** dimensions (rank not fixed) |
| `-1` | `Scalar` | a **scalar** — not an array |
| `-2` | `Any` | **scalar OR array of any rank** — the value may be either |
| `-3` | `ScalarOrOneDimension` | **scalar OR one-dimensional array** |

The values `≥ 1` and `= -1` are the **unambiguous, closed** cases: they nail down the rank exactly. The values `0`, `-2`, `-3` are the **open** cases — they deliberately *decline* to fix the rank. Section 6 is entirely about those.

### 2.3 `ArrayDimensions` — the lengths

`ArrayDimensions` is a `UInt32[]`. It is meaningful **only when `ValueRank ≥ 1`**, and when present its **length equals `ValueRank`**. Each entry is the length of that dimension; a value of `0` means *"this dimension's length is unknown / not fixed."* When `ValueRank ≤ 0`, `ArrayDimensions` is null or empty.

So `ArrayDimensions` is a **refinement** of `ValueRank`, never independent of it. This constraint (`length(ArrayDimensions) == ValueRank`) is what makes the pair jointly consistent rather than two free-floating numbers.

---

## 3. Why this triple is a *strong* concept

"Strong" here means: **the three attributes are orthogonal, each has a closed domain, and their combination is constrained so that no two different triples describe the same value shape while remaining internally consistent.** Concretely:

1. **Orthogonality of concern.** `DataType` = *what an element is*. `ValueRank` = *how many dimensions*. `ArrayDimensions` = *how big*. Changing one does not silently change the meaning of another. You can swap `Double` → `Int32` without touching the shape; you can swap 1-D → 2-D without touching the element type.

2. **Closed domains.** `ValueRank` is not "any integer with vibes" — it is a finite enumeration plus the single open ray `n > 1`. There is exactly one encoding for "1-D array" (`ValueRank = 1`), exactly one for "scalar" (`ValueRank = -1`). No aliasing.

3. **A binding invariant.** `length(ArrayDimensions) == ValueRank` (for `ValueRank ≥ 1`) ties the two shape attributes together. An implementation can *validate* a node's shape rather than guess it.

4. **Element type is rank-independent.** Because `DataType` describes only the element, an *N*-dimensional array of `Double` and a scalar `Double` share the **same** `DataType`. The element type is a stable, reusable atom.

This is precisely the property that makes a **mechanical, total** translation to JSON Schema possible: JSON Schema has the same shape — a **leaf** (`{"type": ...}`) that is independent of how many `{"type":"array","items": …}` wrappers you stack around it.

---

## 4. The i3X / JSON Schema side

JSON Schema encodes shape **structurally and recursively**:

- The **element type** is a leaf object: `{"type":"number"}`, `{"type":"integer"}`, `{"type":"string","format":"date-time"}`, `{"type":"object"}` (for structures), …
- **Each array dimension** is one `{"type":"array","items": <inner> }` wrapper.
- **Length constraints** map to `minItems` / `maxItems` on the corresponding wrapper.

The correspondence to the OPC UA triple is therefore *dimension-for-dimension*:

```
DataType         →  the innermost leaf schema
ValueRank = k    →  k nested { type:"array", items: … } wrappers
ArrayDimensions  →  minItems/maxItems on each wrapper (0 ⇒ omit the bound)
```

That is the whole idea. The OPC UA triple and the JSON Schema tree are two encodings of the same abstract "type × rank × extent" lattice.

---

## 5. How node-i3x implements it today

The mapping lives in [`schema-builder.ts`](../packages/core/src/services/schema-builder.ts). It has two halves.

### 5.1 `DataType → leaf` (`jsonSchemaForDataType`)

A lookup table normalizes both the **symbolic name** (`"Double"`, `"Boolean"`) and the **numeric NodeId** (`"i=11"`, `"i=1"`, and namespace-qualified `"ns=0;i=11"`) onto a JSON Schema leaf, honoring the RFC §5.2.1 requirement that values be *coerced to a JSON primitive*:

| OPC UA `DataType` | JSON Schema leaf |
|---|---|
| `Boolean` (`i=1`) | `{ "type": "boolean" }` |
| `SByte`…`UInt64`, `Integer`, `Enumeration` (`i=2..9,27,28`) | `{ "type": "integer" }` |
| `Float`, `Double`, `Number`, `Duration` (`i=10,11,26,290`) | `{ "type": "number" }` |
| `String`, `LocalizedText`, `QualifiedName`, `XmlElement`, `Guid`, `NodeId` | `{ "type": "string" }` |
| `ByteString` (`i=15`) | `{ "type": "string", "contentEncoding": "base64" }` |
| `DateTime`, `UtcTime` (`i=13,294`) | `{ "type": "string", "format": "date-time" }` |
| `StatusCode` | `{ "type": "integer" }` |
| `ExtensionObject` / `Structure` | `{ "type": "object" }` |
| *unknown* | `{ "type": "string" }` (safe fallback) |

Note two deliberate design choices that keep the leaf **unambiguous for a JSON consumer**:

- `LocalizedText`, `QualifiedName`, `Guid`, `NodeId` all collapse to `string`. They *are* strings on the wire (RFC §5.2.1); a REST client should not have to know they were something richer in OPC UA.
- `ByteString` carries `contentEncoding: "base64"`, so a consumer knows the string is binary — losslessly, in a standard JSON-Schema-native way.

### 5.2 `ValueRank → array wrapping` (`schemaForMember`)

```ts
let schema = jsonSchemaForDataType(member.dataType);
if (member.valueRank !== undefined && member.valueRank !== null && member.valueRank >= 0) {
  schema = { type: 'array', items: schema };
}
```

Today node-i3x makes a **binary** decision:

- `ValueRank ≥ 0` → wrap once in `{ type:"array", items }`.
- otherwise (`-1`, and by omission `-2`/`-3`) → leave the scalar leaf.

This is a pragmatic, correct-for-the-common-case simplification:

- `ValueRank = -1` (scalar) → leaf. ✓ exact.
- `ValueRank = 1` (1-D array) → one array wrapper. ✓ exact.
- `ValueRank = 0` (one-or-more dims) → one array wrapper — a *reasonable* lower bound (at least an array), though it does not capture "or more". ≈
- `ValueRank ≥ 2` (matrix) → **only one** wrapper — under-describes a matrix as a flat array. ⚠ lossy.
- `ValueRank = -2 / -3` → treated as scalar. ⚠ *wrong* when the runtime value is actually an array.

The rest of this document is about upgrading the two ⚠ rows — most importantly `-2` — from "pragmatic" to "exact," using JSON-Schema-native constructs.

### 5.3 A note on `ArrayDimensions`

`ArrayDimensions` is currently **not** read into `ObjectTypeMemberInfo` (see [`data-source.ts`](../packages/core/src/ports/data-source.ts) — only `dataType` and `valueRank` are carried). The natural extension is `minItems`/`maxItems` per wrapper:

```jsonc
// ValueRank = 1, ArrayDimensions = [3]  →  fixed-length vector of 3
{ "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 }

// ValueRank = 1, ArrayDimensions = [0]  →  unbounded vector (0 = unknown ⇒ no bound)
{ "type": "array", "items": { "type": "number" } }
```

The invariant `length(ArrayDimensions) == ValueRank` means each wrapper gets **exactly one** dimension's bounds — the nesting depth and the `ArrayDimensions` length agree by construction, which is why this refinement is mechanical and total.

---

## 6. The exact multi-dimensional mapping

To make `ValueRank ≥ 2` exact, wrap **once per dimension**. For an element leaf `E` and `ValueRank = k`:

```
schema_k = { type:"array", items: schema_{k-1} }   for k ≥ 1
schema_0 = E
```

Example — a 2-D matrix of `Double` (`DataType = Double`, `ValueRank = 2`, `ArrayDimensions = [3,4]`):

```jsonc
{
  "type": "array",
  "minItems": 3, "maxItems": 3,          // outer dimension, length 3
  "items": {
    "type": "array",
    "minItems": 4, "maxItems": 4,        // inner dimension, length 4
    "items": { "type": "number" }        // the Double leaf
  }
}
```

Reference helper:

```ts
function wrapRank(leaf: Record<string, unknown>, valueRank: number,
                 arrayDimensions?: readonly number[]): Record<string, unknown> {
  if (valueRank < 0) return leaf;                 // scalar / handled elsewhere
  const dims = Math.max(valueRank, 1);            // ValueRank 0 ⇒ at least 1-D
  let schema = leaf;
  for (let d = dims - 1; d >= 0; d--) {
    const wrapper: Record<string, unknown> = { type: 'array', items: schema };
    const len = arrayDimensions?.[d];
    if (typeof len === 'number' && len > 0) {     // 0 ⇒ unbounded ⇒ no min/maxItems
      wrapper.minItems = len;
      wrapper.maxItems = len;
    }
    schema = wrapper;
  }
  return schema;
}
```

---

## 7. The special case: `ValueRank = -2` (`Any`)

### 7.1 Why it is genuinely ambiguous

Every case in §6 fixes the rank. `ValueRank = -2` (`Any`) is the one value that **deliberately refuses to**: the variable may legitimately hold, at different times, a **scalar**, a **1-D array**, *or* a **matrix of any rank** — all with the same declared `DataType`. This is not underspecification by an author; it is a *first-class* OPC UA statement of "the shape varies at runtime." (`ValueRank = -3`, `ScalarOrOneDimension`, is the narrower sibling: scalar *or* 1-D array, nothing higher.)

A single, fixed JSON Schema leaf **cannot** describe this. `{ "type":"number" }` rejects `[1,2,3]`; `{ "type":"array", … }` rejects the scalar `42`. The binary "scalar-or-array" decision in §5.2 must be *wrong* for one of the two runtime forms.

### 7.2 The resolution: `oneOf`

JSON Schema has a native construct for "any one of these alternative shapes": **`oneOf`**. It matches the *open* nature of `ValueRank = -2` exactly — a value is valid iff it matches **exactly one** branch, and scalar / vector / matrix branches are mutually exclusive by JSON type, so `oneOf` (strict "exactly one") is the right combinator rather than `anyOf`:

```jsonc
// DataType = Double, ValueRank = -2 (Any)  →  Scalar OR Vector OR Matrix
{
  "title": "Measurement",
  "oneOf": [
    { "type": "number" },                                       // Scalar
    { "type": "array", "items": { "type": "number" } },         // 1-D array
    { "type": "array",                                          // ≥2-D array (matrix+)
      "items": { "type": "array", "items": { "type": "number" } } }
  ]
}
```

For `ValueRank = -3` (`ScalarOrOneDimension`) the same idea with just the first two branches:

```jsonc
{
  "oneOf": [
    { "type": "number" },                                       // Scalar
    { "type": "array", "items": { "type": "number" } }          // 1-D array only
  ]
}
```

The matrix branch above is written to depth 2 for readability. To admit *any* rank ≥ 2 exactly, the inner array can be made recursive with a `$ref`/`$defs` self-reference, or capped at the deepest rank the model actually declares. In practice a scalar/1-D/2-D triple covers essentially all real `Any` variables.

### 7.3 Why `oneOf` preserves the "strong concept" guarantee

The elegance is that `oneOf` **inherits** the same three properties that made the OPC UA triple strong (§3):

- **Orthogonality is preserved** — every branch shares the *same element leaf* (`{"type":"number"}`), so the `DataType` decision is still made once and reused. The branches differ *only* in rank wrapping, exactly mirroring how `ValueRank` is orthogonal to `DataType`.
- **The domain stays closed** — `-2` expands to a small, enumerable set of branches (scalar, 1-D, 2-D, …); `-3` to exactly two. There is no open-ended guessing.
- **No aliasing** — the branches are mutually exclusive by JSON type (a number is never an array; a flat array never matches the matrix branch), so a validator can tell you *which* rank a given runtime value actually is. The ambiguity that lived in `ValueRank = -2` is resolved *at validation time against the concrete value*, which is precisely where OPC UA intended it to be resolved.

In other words, `oneOf` is not a workaround — it is the **structural JSON Schema image of `ValueRank = Any`**. The OPC UA "the rank is decided at runtime" statement becomes the JSON Schema "the value matches exactly one of these ranks" statement. Same semantics, native encoding, zero information lost.

---

## 8. Summary table

| OPC UA `(DataType, ValueRank, ArrayDimensions)` | JSON Schema | node-i3x today | Exact mapping |
|---|---|---|---|
| `Double, -1, –` (scalar) | `{type:"number"}` | ✓ | ✓ |
| `Double, 1, [0]` (1-D, unbounded) | `{type:"array", items:{type:"number"}}` | ✓ | ✓ |
| `Double, 1, [3]` (1-D, fixed) | `…+ minItems/maxItems:3` | shape ✓, bounds ✗ | add `minItems`/`maxItems` |
| `Double, 2, [3,4]` (matrix) | nested `array` × 2 | ⚠ one wrapper only | wrap per §6 |
| `Double, 0` (one-or-more) | at least `array` | ≈ one wrapper | `oneOf` of ranks ≥ 1 |
| `Double, -2` (**Any**) | **`oneOf`** [scalar, 1-D, matrix] | ⚠ treated as scalar | **`oneOf` per §7** |
| `Double, -3` (Scalar-or-1-D) | `oneOf` [scalar, 1-D] | ⚠ treated as scalar | `oneOf`, two branches |

---

## 9. Takeaways

1. OPC UA's `(DataType, ValueRank, ArrayDimensions)` is a **strong, orthogonal, closed-domain** description of value shape — element type, rank, and extent are independent concerns bound by one invariant (`length(ArrayDimensions) == ValueRank`).
2. JSON Schema expresses the *same* lattice **structurally**: one leaf for `DataType`, one `array`-wrapper per `ValueRank` dimension, `minItems`/`maxItems` for `ArrayDimensions`. The mapping is mechanical and, for every rank-fixing case, **total and lossless**.
3. node-i3x today implements the common cases exactly (scalar, 1-D) and the rest pragmatically; the exact upgrade is "wrap once per dimension" plus threading `ArrayDimensions` into the port.
4. The one genuinely ambiguous OPC UA construct — `ValueRank = -2` (`Any`), and its sibling `-3` — has a native JSON Schema image: **`oneOf`** over the scalar / vector / matrix branches. It is not a hack; it is the faithful translation of "the rank is decided against the runtime value," and it preserves every strength (orthogonality, closed domain, no aliasing) of the original OPC UA concept.
