# Dual Licensing Guide

> **node-i3x** is dual-licensed under the **AGPL-3.0-or-later** and a
> **Sterfive Commercial License**. This document explains what each
> license allows and when you need which.

## At a Glance

| | AGPL-3.0 | Sterfive Commercial |
|---|:---:|:---:|
| **Cost** | Free | Paid |
| **Source code** | Must be disclosed | Stays private |
| **Support** | Community only | Dedicated support & SLA |

---

## What You CAN Do

| Use case | AGPL-3.0 | Commercial |
|----------|:--------:|:----------:|
| Use internally (evaluation, dev, testing) | ✅ | ✅ |
| Modify the source code | ✅ | ✅ |
| Deploy as a network service (SaaS) | ✅ ⚠️ | ✅ |
| Distribute in your product | ✅ ⚠️ | ✅ |
| Use in open-source (AGPL-compatible) projects | ✅ | ✅ |
| Use in **proprietary / closed-source** products | ❌ | ✅ |
| OEM / embed in commercial hardware | ❌ | ✅ |

> ⚠️ = Allowed, but with significant obligations (see below).

---

## Obligations Under AGPL-3.0

The **A** in AGPL stands for **Affero** — it extends the standard GPL
copyleft to **network use**. This is the key difference from the GPL:

| Obligation | What it means |
|------------|---------------|
| **Disclose full source code** | If you deploy this software as a network service (REST API, web app, cloud service, SaaS), you **must** make the **complete source code** of your application available to all users of that service — even if you never distribute a binary. |
| **Copyleft (derivative works)** | Any software that incorporates, links to, or derives from this code must also be licensed under the AGPL-3.0. Your proprietary code becomes AGPL too. |
| **Preserve notices** | You must preserve all copyright and license notices in the source code and any user-facing output. |
| **No additional restrictions** | You may not impose further restrictions on the rights granted by the AGPL. |
| **No warranty** | The software is provided AS-IS, without warranty of any kind. |

### The Critical Implication

> **If you use node-i3x in a server that users interact with over
> a network** (REST API, web app, cloud platform, IoT gateway),
> you **must** make your **entire application's source code**
> available to those users under the AGPL — even if you never
> distribute a binary.

This is the main reason industrial, SaaS, and OEM users choose the
commercial license.

---

## When You Need a Commercial License

| Your scenario | License needed |
|---------------|:-:|
| Open-source project (AGPL-compatible) | AGPL ✅ |
| Internal R&D / proof of concept (not deployed to users) | AGPL ✅ |
| Academic / research use (results are public) | AGPL ✅ |
| SaaS product — **willing to open-source everything** | AGPL ✅ |
| SaaS product — **proprietary code** | **Commercial** 💼 |
| Embedded in proprietary hardware / appliance | **Commercial** 💼 |
| Distributed in closed-source software | **Commercial** 💼 |
| Need dedicated support, SLA, or warranty | **Commercial** 💼 |
| OEM distribution to customers | **Commercial** 💼 |

---

## What the Commercial License Gives You

| Benefit | Details |
|---------|---------|
| **No copyleft** | Keep your proprietary code private. No obligation to disclose source. |
| **No AGPL network clause** | Deploy as SaaS without source disclosure. |
| **`@sterfive/opcua-optimized-client`** | Included with the commercial license. Drop-in session wrapper that adds automatic request batching, operation-limit splitting, continuation-point handling, and hold-and-resume during network disconnections. Significantly improves throughput and reliability for large address spaces and high-frequency data access. |
| **Dedicated support** | Direct access to the Sterfive engineering team. |
| **Maintenance & updates** | Priority bug fixes and feature requests. |
| **Warranty & indemnification** | Per your commercial agreement. |
| **Custom terms** | License terms tailored to your deployment model. |

---

## Obtain a Commercial License

> **Sterfive SAS**
>
> 🌐 Website: [sterfive.com](https://sterfive.com)
>
> 📧 Email: [contact@sterfive.com](mailto:contact@sterfive.com)

---

## SPDX Identifier

```
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Sterfive-Commercial
```

---

*Copyright © 2026 Sterfive SAS — [sterfive.com](https://sterfive.com)*
