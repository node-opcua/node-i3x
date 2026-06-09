# i3X ↔ OPC UA: Capability Gaps

> **Purpose**: Document where the i3X Beta specification does not
> fully leverage OPC UA's capabilities, with industrial examples
> showing where this creates real operational risk.
>
> **Created**: 2026-06-09 — Based on i3X Beta OpenAPI spec analysis

---

## Executive Summary

The i3X specification provides a clean, web-friendly abstraction
over OPC UA. However, the current Beta spec treats OPC UA as a
simple tag-based data source, ignoring key pillars that make
OPC UA an **industrial-grade** protocol:

1. **Event-driven monitoring** — critical for discrete signals
2. **Alarms & Conditions** — the entire safety/alerting layer
3. **Method invocation** — remote commands and operations
4. **Dynamic address space** — nodes appearing/disappearing at runtime
5. **OPC UA events** — typed notifications beyond data changes
6. **Semantic change detection** — metadata evolving at runtime

These gaps mean that an i3X-only client cannot safely operate
in scenarios that are routine for native OPC UA clients.

---

## Gap 1: No Event-Driven Monitoring

### What i3X offers

The `POST /subscriptions/register` endpoint accepts:

```json
{ "subscriptionId": "...", "elementIds": ["..."], "maxDepth": 1 }
```

No parameter to control **how** values are monitored. The server
decides sampling rate internally.

### What OPC UA offers

OPC UA `MonitoredItem` creation has rich parameters:

| Parameter | Purpose |
|-----------|---------|
| `samplingInterval` | 0 = event-driven, >0 = polling (ms) |
| `queueSize` | Buffer size for rapid changes |
| `discardOldest` | Keep newest or oldest on overflow |
| `filter` → `DataChangeFilter` | Deadband, trigger mode |
| `filter` → `EventFilter` | Alarm/event selection |

### Industrial Example: Packaging Line Safety Gate

```
┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Safety Gate │────▶│  PLC Boolean │────▶│  i3X     │
│  (physical)  │     │  ns=4;s=Gate │     │  Server  │
│              │     │  Open/Closed │     │          │
└──────────────┘     └──────────────┘     └──────────┘
```

**Scenario**: An operator opens a safety gate for 200ms to
clear a jam, then closes it. The PLC records this as a
`true → false → true` transition.

| Monitoring Mode | What i3X sees |
|----------------|---------------|
| **Sampling at 1000ms** | ❌ **Misses the event entirely** — the gate was open for only 200ms between two samples |
| **Sampling at 250ms** | ⚠️ Might catch it, might not — depends on phase alignment |
| **Event-driven** (`samplingInterval: 0`) | ✅ Captures every transition with exact timestamps |

**Risk**: Safety audit trail is incomplete. The MES/SCADA
system never knows the gate was opened. Compliance violation
in FDA 21 CFR Part 11 or IEC 62443 environments.

### Industrial Example: Discrete Part Counter

A CNC machine increments a part counter on each cycle
(every 800ms). With `samplingInterval: 1000ms`, the i3X
server sees values jumping by 2 or 3 — individual parts
are lost. Production count is wrong.

---

## Gap 2: No Alarms & Conditions (OPC UA Part 9)

### What i3X offers

Nothing. The spec has no concept of alarms, conditions,
severity, acknowledgement, or alarm state machines.

### What OPC UA offers

OPC UA Alarms & Conditions is a complete alarm management
framework:

```
┌─────────────────────────────────────────────┐
│              OPC UA A&C                     │
├─────────────────────────────────────────────┤
│  ConditionType                              │
│  ├── AckedState      (acknowledged?)        │
│  ├── ConfirmedState   (confirmed?)          │
│  ├── EnabledState     (active?)             │
│  ├── Severity         (0-1000)              │
│  ├── Message          (human-readable)      │
│  ├── SourceName       (which sensor)        │
│  ├── Time             (when it happened)    │
│  └── Methods:                               │
│      ├── Acknowledge()                      │
│      ├── Confirm()                          │
│      └── AddComment()                       │
│                                             │
│  AlarmConditionType (extends Condition)      │
│  ├── ActiveState                            │
│  ├── SuppressedState                        │
│  ├── ShelvingState                          │
│  └── LimitAlarm, ExclusiveLevelAlarm, ...   │
└─────────────────────────────────────────────┘
```

### Industrial Example: Chemical Reactor Temperature

```
┌──────────────────────────────────────────────────────┐
│  Reactor Temperature Profile                         │
│                                                      │
│  200°C ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ HIGH-HIGH (Emergency)   │
│                         ╱╲                           │
│  180°C ─ ─ ─ ─ ─ ─ ─ ╱─ ╲─ ─ HIGH (Warning)        │
│                      ╱    ╲                          │
│  150°C ─────────────╱──────╲─────── Normal           │
│                                                      │
│  Time ──────────────────────────────▶                │
└──────────────────────────────────────────────────────┘
```

**With OPC UA A&C**: The server raises a `HighHighAlarm` at
200°C with severity 900. The operator MUST acknowledge it.
The alarm state machine tracks: `Active → Acknowledged →
Confirmed → Inactive`. Full audit trail.

**With i3X only**: The client polls the temperature value
and sees "195... 200... 205". It has no concept of:
- **Severity** — is 200°C dangerous or just warm?
- **Alarm state** — is this a new alarm or a known condition?
- **Acknowledgement** — has anyone seen this?
- **Shelving** — is the alarm suppressed during maintenance?
- **Audit trail** — who acknowledged at what time?

**Risk**: In a pharmaceutical plant, unacknowledged alarms
during a batch process can invalidate the entire batch
(worth $50K–$500K). In petrochemical, it's a safety risk.

### Industrial Example: Conveyor Belt Motor Overload

A motor protection relay trips on overload. OPC UA sends:
- `OffNormalAlarm` with `ActiveState = true`
- `Severity = 800`
- `Message = "Motor M-4201 thermal overload"`
- `SourceName = "Drive/Motor/ThermalProtection"`

The operator acknowledges via OPC UA method call. The alarm
transitions to `Acknowledged`. When the motor cools and the
relay resets, `ActiveState → false`. Full lifecycle tracked.

**With i3X**: The client sees a boolean go `true → false`.
No severity, no message, no acknowledgement workflow.
The operator has no way to acknowledge the alarm through
the i3X interface.

---

## Gap 3: No Command Invocation (OPC UA Methods)

### What i3X offers

Read/write values only. No way to call methods.

### What OPC UA offers

OPC UA Methods allow remote procedure calls with typed
input/output arguments:

```typescript
// OPC UA Method Call
session.call({
  objectId: "ns=4;s=CoffeeMachine",
  methodId: "ns=4;s=Brew",
  inputArguments: [
    { dataType: "String",  value: "Espresso" },
    { dataType: "Double",  value: 92.5 },      // temperature
    { dataType: "UInt32",  value: 25 },         // extraction time
  ]
});
// → outputArguments: [{ dataType: "Boolean", value: true }]
```

### Industrial Example: CNC Tool Change

```
Operator wants to change tool on CNC machine:

  OPC UA way:
  ┌──────┐  CallMethod("LoadTool", toolId=7)  ┌─────────┐
  │  HMI │ ──────────────────────────────────▶ │   CNC   │
  │      │ ◀────────────────────────────────── │  PLC    │
  └──────┘  Result: { success: true,           └─────────┘
                      previousTool: 3,
                      newTool: 7,
                      estimatedTime: 12.5 }

  i3X way:
  ┌──────┐  WriteValue("ToolRequest", 7)       ┌─────────┐
  │  HMI │ ──────────────────────────────────▶ │   CNC   │
  │      │  ??? How to know it worked ???      │  PLC    │
  │      │  Poll "ToolCurrent" until it = 7?   └─────────┘
  └──────┘  What if it failed? No error info.
```

**Risk**: The write-and-poll pattern has no transactional
semantics. The client doesn't know if:
- The command was received
- The command is being executed
- The command failed (and why)
- The command completed (and what the result was)

### Industrial Example: Emergency Stop

An operator needs to send an E-Stop command to a robot cell:

| Approach | Behavior |
|----------|----------|
| **OPC UA Method** | `CallMethod("EmergencyStop")` → immediate `StatusCode` confirming the PLC received and executed the stop |
| **i3X WriteValue** | `WriteValue("EStopRequest", true)` → write succeeds, but did the PLC act on it? Must poll `EStopState` to verify. 100ms+ delay. |

In safety-critical systems, the difference between
"confirmed executed" and "write succeeded, hope it works"
is the difference between compliance and violation.

---

## Gap 4: No Monitoring Mode Distinction

### The Problem

i3X treats all monitored items identically. OPC UA
distinguishes:

| OPC UA MonitoringMode | When to use |
|----------------------|-------------|
| `Sampling` (interval > 0) | Analog process values — temperature, pressure, flow |
| `Reporting` (interval = 0) | Discrete state changes — booleans, enums, counters |
| `Disabled` | Temporarily suspend without unregistering |

### Industrial Example: Bottling Line

A bottling line has 200 monitored points:

| Signal Type | Count | Optimal Mode | Current i3X Mode |
|-------------|-------|-------------|-----------------|
| Flow rate, temperature, pressure | 40 | Sampling @ 500ms, 1% deadband | ⚠️ Sampling @ 5000ms, no deadband |
| Valve states (open/closed) | 80 | Event-driven (interval=0) | ❌ Sampling @ 5000ms — misses fast transitions |
| Counters (bottles/min) | 20 | Event-driven + queueSize=100 | ❌ Sampling — loses counts |
| Setpoints (rarely change) | 40 | Sampling @ 10000ms | ⚠️ Sampling @ 5000ms — wastes bandwidth |
| Alarm booleans | 20 | Event-driven | ❌ Sampling — misses short alarms |

**Result**: 60% of the signals are monitored sub-optimally.
Discrete signals miss transitions. Analog signals waste
bandwidth. Counters lose data.

---

## Gap 5: Static Model — No Dynamic Address Space

### What i3X offers

The model is built **once** at server startup by calling
`browseTree()`. The result is cached indefinitely. The i3X
spec has no mechanism for:
- Detecting new nodes appearing in the address space
- Detecting nodes being removed
- Notifying clients that the tree structure has changed

### What OPC UA offers

OPC UA address spaces are **dynamic by design**. Servers
can add and remove nodes at runtime, and clients are
notified through:

| OPC UA Mechanism | Purpose |
|-----------------|---------|
| `GeneralModelChangeEventType` | Fired when nodes are added/removed/modified |
| `ModelChangeStructureDataType` | Describes what changed: `NodeAdded`, `NodeDeleted`, `ReferenceAdded`, `ReferenceDeleted`, `DataTypeChanged` |
| `SemanticChangeEventType` | Fired when a node's semantic meaning changes (e.g. engineering unit, range) |

A client that subscribes to the Server object's events
receives `GeneralModelChangeEvent` whenever the tree
structure mutates.

### Industrial Example: Quality Measurement Results

A CMM (Coordinate Measuring Machine) creates a new result
node for each inspected part:

```
  Server                              Server
  (before measurement)                (after measurement)
  ┌──────────────────┐                ┌──────────────────────┐
  │  MeasurementJobs │                │  MeasurementJobs     │
  │  └── Job_0042    │                │  ├── Job_0042        │
  │      └── Status  │                │  │   ├── Status      │
  │                  │                │  │   └── Results ←NEW│
  │                  │                │  │       ├── X: 10.02│
  │                  │                │  │       ├── Y: 5.01 │
  │                  │                │  │       └── Z: 3.00 │
  └──────────────────┘                └──────────────────────┘
```

**With native OPC UA**: The client subscribes to
`GeneralModelChangeEvent` on the Server object. When the
CMM creates the `Results` folder with measurement values,
the client receives an event with `verb = NodeAdded` and
immediately sees the new data.

**With i3X**: The model was built at startup. The `Results`
folder didn't exist then — it was created mid-job. The i3X
client **never sees it**. The API returns 404 for the new
elementIds. The only workaround is to restart the i3X
server or manually call `invalidateCache()`.

**Risk**: An MES system polling i3X for quality data never
receives measurement results. Parts ship without QC
records. Recall risk.

### Industrial Example: ISA-95 Job Management

A production line managed via OPC UA ISA-95 creates job
objects dynamically:

```
  ProductionLine
  └── Jobs
      ├── JOB-2026-0608-001   ← created when order received
      │   ├── Status: "Running"
      │   ├── Recipe: "Widget-A"
      │   ├── StartTime
      │   └── ActualQuantity
      ├── JOB-2026-0608-002   ← created 2 hours later
      │   └── Status: "Queued"
      └── (JOB-2026-0607-xxx  ← removed after archival)
```

Each job is an OPC UA Object created at runtime and deleted
after archival. The `Jobs` folder is constantly mutating.

**With native OPC UA**: The MES subscribes to model change
events and gets notified of each new job instantly.

**With i3X**: The model snapshot from startup shows
yesterday's jobs. Today's jobs are invisible. The operator
dashboard shows stale data.

### Industrial Example: Device Hot-Swap (OPC UA DI)

An OPC UA DI (Devices Integration) server manages a
fieldbus. When a device is physically replaced:

```
  DeviceSet
  ├── Sensor_TT-4201        ← removed (device unplugged)
  └── Sensor_TT-4201_v2     ← added (new device plugged in)
      ├── Temperature
      ├── SerialNumber: "SN-2026-NEW"
      └── FirmwareVersion: "3.1"
```

**With i3X**: The old `Sensor_TT-4201` elementId still
exists in the cached model. Reads return stale/error data.
The new device's nodes are invisible. Subscriptions on
the old elementId deliver garbage or fail silently.

---

## Gap 6: No OPC UA Event Support

### What i3X offers

The model recognizes `eventSource` nodes (objects with
`eventNotifier = true`), but **never subscribes to their
events**. The `kind: 'eventSource'` classification exists
in the domain model but is unused.

### What OPC UA offers

OPC UA events are a rich, typed notification system that
goes far beyond data value changes:

```
┌──────────────────────────────────────────────────────┐
│  BaseEventType (all events inherit from this)        │
│  ├── EventId       (unique opaque identifier)        │
│  ├── EventType     (NodeId of the type)              │
│  ├── SourceNode    (which object raised it)          │
│  ├── SourceName    (human-readable source)           │
│  ├── Time          (when it occurred)                │
│  ├── ReceiveTime   (when server received it)         │
│  ├── Message       (human-readable description)      │
│  └── Severity      (0-1000, urgency level)           │
│                                                      │
│  Subtypes include:                                   │
│  ├── SystemEventType (server-level events)           │
│  ├── AuditEventType  (security/config audit trail)   │
│  ├── TransitionEventType (state machine transitions) │
│  ├── ConditionType   (alarms — see Gap 2)            │
│  └── Custom event types (vendor-defined)             │
└──────────────────────────────────────────────────────┘
```

Events are subscribed via `EventFilter`:
```typescript
// Subscribe to events on the Server object
session.createMonitoredItem({
  nodeId: "ns=0;i=2253",                   // Server
  attributeId: AttributeIds.EventNotifier,  // NOT Value!
  filter: new EventFilter({
    selectClauses: [
      ["EventType"], ["SourceName"], ["Time"],
      ["Message"],   ["Severity"],
    ],
    whereClause: {
      // e.g., Severity >= 500
    },
  }),
});
```

### Industrial Example: Audit Trail (FDA 21 CFR Part 11)

A pharmaceutical batch reactor must log **every**
configuration change and operator action:

```
  OPC UA AuditEvents received:
  ┌────────────────────────────────────────────────────┐
  │ Time         │ Who        │ What                   │
  ├──────────────┼────────────┼────────────────────────┤
  │ 08:15:03.120 │ Operator_A │ SetPoint changed       │
  │              │            │ 150°C → 155°C          │
  │ 08:22:45.030 │ Operator_B │ Recipe loaded: "RX-42" │
  │ 08:30:12.890 │ SYSTEM     │ Batch phase transition │
  │              │            │ "Heating" → "Holding"  │
  │ 09:01:33.440 │ Operator_A │ Alarm acknowledged     │
  │              │            │ "TT-101 High"          │
  └──────────────┴────────────┴────────────────────────┘
```

**With native OPC UA**: The SCADA system subscribes to
`AuditEventType` and records every event with full
attribution (who, what, when). This is the legally required
electronic record for FDA compliance.

**With i3X**: No event subscription exists. The audit trail
is empty. The batch record is non-compliant. The plant
cannot ship the product.

### Industrial Example: State Machine Transitions

A packaging machine uses OPC UA PackML state machine:

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  IDLE    │───▶│ STARTING │───▶│ EXECUTE  │
  └──────────┘    └──────────┘    └──────────┘
       ▲                               │
       │          ┌──────────┐         │
       └──────────│ STOPPING │◀────────┘
                  └──────────┘
```

Each transition fires a `TransitionEventType`:
- `FromState = "Execute"`, `ToState = "Stopping"`
- `Transition = "ExecuteToStopping"`
- `Time = 2026-06-09T08:45:12.003Z`

**With i3X**: The client polls `CurrentState` and sees
`"Execute"` ... `"Stopping"`. But:
- It doesn't know **when** the transition happened (only
  when it was sampled)
- It doesn't know **which transition** was taken (there
  may be multiple paths)
- If two transitions happen between polls, it misses the
  intermediate state entirely

### Industrial Example: Journal / Log Entries

An OPC UA server for a water treatment plant maintains
a `Journal` object that emits events for each treatment
step:

```
  WaterTreatment
  └── Journal (EventNotifier = true)
      Events:
      ├── "Chlorination started, dosage=2.5mg/L"
      ├── "pH adjusted to 7.2"
      ├── "Filtration cycle #42 complete"
      └── "Sample taken, lab ref=LAB-2026-0609-003"
```

These are **not** stored as child nodes — they are
transient OPC UA events. There is no Variable to read.
The only way to capture them is via event subscription.

**With i3X**: These journal entries are completely
invisible. The treatment log is empty.

---

## Gap 7: No Semantic Change Notification

### What i3X offers

No mechanism to detect when a node's meaning or
configuration changes at runtime.

### What OPC UA offers

OPC UA defines `SemanticChangeEventType` for cases where
a node's **metadata** changes without its NodeId changing:

| Semantic Change | Example |
|----------------|---------|
| Engineering unit changes | °C → °F |
| Range changes | 0-100 → 0-200 |
| Description update | "Temperature" → "Reactor Core Temp" |
| Access level changes | Read-Write → Read-Only |

### Industrial Example: Multi-Product Manufacturing

A filling line handles different products. When the
product changeover happens:

```
  Before changeover:              After changeover:
  ┌──────────────────────┐        ┌──────────────────────┐
  │  FillingStation      │        │  FillingStation       │
  │  ├── FillLevel       │        │  ├── FillLevel        │
  │  │   Unit: mL        │        │  │   Unit: oz     ←!! │
  │  │   Range: 0-500    │        │  │   Range: 0-16  ←!! │
  │  ├── Temperature     │        │  ├── Temperature      │
  │  │   Unit: °C        │        │  │   Unit: °F     ←!! │
  │  │   Range: 0-100    │        │  │   Range: 32-212←!! │
  └──────────────────────┘        └──────────────────────┘
```

The NodeIds stay the same. The FillLevel Variable still
exists at `ns=4;s=FillLevel`. But its engineering unit
changed from `mL` to `oz`, and its range changed.

**With native OPC UA**: The client receives a
`SemanticChangeEvent` and re-reads the node's engineering
unit and range. The HMI updates its axis labels and scales.

**With i3X**: The model was cached at startup. The client
still thinks the unit is mL. The operator reads "480" and
assumes 480mL — but it's actually 480oz (14 liters).
Wrong dosage. Product recall.

### Industrial Example: Calibration Update

A pressure transmitter is recalibrated in the field:

| Property | Before | After |
|----------|--------|-------|
| `EngineeringUnits` | bar | kPa |
| `EURange.Low` | 0 | 0 |
| `EURange.High` | 10 | 1000 |
| `InstrumentRange.High` | 16 | 1600 |

The i3X client's cached model has the old calibration
data. Any trending, alarming, or display logic based on
the cached range is now wrong. A value of "500" looks
like it's 50× over range (if the client thinks max=10),
triggering false alarms or — worse — suppressing real
alarms if the logic is inverted.

---

## Summary Table

| # | Capability | OPC UA | i3X Beta | Risk Level |
|---|-----------|--------|----------|------------|
| 1 | Analog value monitoring | ✅ Sampling + deadband | ⚠️ Sampling only, no deadband | Low |
| 2 | Discrete value monitoring | ✅ Event-driven (interval=0) | ❌ Sampling only | **High** |
| 3 | Alarm detection & lifecycle | ✅ Full A&C framework | ❌ Not supported | **Critical** |
| 4 | Alarm acknowledgement | ✅ Ack/Confirm methods | ❌ Not possible | **Critical** |
| 5 | Command invocation | ✅ Method calls with typed args | ❌ Not supported | **High** |
| 6 | Monitoring mode control | ✅ Per-item configuration | ❌ One-size-fits-all | Medium |
| 7 | Deadband filtering | ✅ Absolute & percent | ❌ Not supported | Medium |
| 8 | Queue management | ✅ Per-item queueSize | ❌ Hardcoded | Low |
| 9 | Dynamic address space | ✅ ModelChangeEvents | ❌ Static model, built once | **Critical** |
| 10 | OPC UA events | ✅ EventFilter subscription | ❌ Not supported (kind exists, unused) | **Critical** |
| 11 | Audit trail events | ✅ AuditEventType | ❌ Not supported | **High** |
| 12 | State machine transitions | ✅ TransitionEventType | ❌ Polling only, misses transitions | **High** |
| 13 | Semantic change detection | ✅ SemanticChangeEvent | ❌ Cached metadata goes stale | **High** |

---

## Our Current Implementation Status

| Component | What we do today | Gap |
|-----------|-----------------|-----|
| `ModelService._cache` | Built once, cached forever | No re-browse, no invalidation trigger |
| `invalidateCache()` | Exists but never called automatically | Dead code |
| `kind: 'eventSource'` | Nodes classified but unused | Never subscribed to events |
| `actionToMethod` map | Actions discovered, pairs stored | No REST endpoint to invoke |
| `samplingInterval` | Hardcoded = `publishingIntervalMs` for all items | No per-item control |
| `queueSize` | Hardcoded = 10 for all items | No per-item control |

---

## Recommendations

### Short-term (can implement without spec changes)

1. **Smart defaults** — detect node DataType and auto-select:
   - Boolean/enum → `samplingInterval: 0` (event-driven)
   - Numeric → `samplingInterval: 1000`, `queueSize: 10`
   - Counter → `samplingInterval: 0`, `queueSize: 100`

2. **Server-side config** — allow per-namespace or per-type
   monitoring profiles in the server configuration.

### Medium-term (custom extensions)

3. **Command endpoint** — `POST /v1/objects/{elementId}/invoke`
   (see [epic-commands.md](./epic-commands.md))

4. **Extended register** — add optional monitoring parameters:
   ```json
   {
     "elementIds": ["..."],
     "maxDepth": 1,
     "monitoringMode": "event-driven",
     "samplingInterval": 0,
     "deadband": { "type": "absolute", "value": 0.5 }
   }
   ```

### Long-term (spec evolution needed)

5. **Alarm endpoints** — subscribe to events, acknowledge,
   shelve, query active alarms. This requires new i3X spec
   paths and schemas.

6. **Event streaming** — SSE events carrying alarm/condition
   data alongside value changes.

---

## Related Epics

- [epic-commands.md](./epic-commands.md) — Method call invocation
- *(planned)* epic-alarms.md — Alarms & Conditions support
- *(planned)* epic-smart-monitoring.md — Adaptive sampling modes
