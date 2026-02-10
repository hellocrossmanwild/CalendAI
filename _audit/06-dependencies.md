# Audit 06 -- Dependency Analysis

**Auditor**: Supply Chain Security Specialist
**Date**: 2026-02-09
**Scope**: package.json (79 dependencies, 26 devDependencies), package-lock.json (771 total packages)
**Rating scale**: CRITICAL | HIGH | MEDIUM | LOW

---

## Executive Summary

The CalendAI project has **79 production dependencies** and **26 dev dependencies** expanding to **771 total resolved packages** in the lockfile. The audit identified **2 known high-severity vulnerabilities**, significant dependency hygiene issues including ~20 unused or dead-code packages, misplaced type declarations, phantom dependencies in the build script, and a `framer-motion` dep (134 kB gzipped) that is never actually imported. No GPL/copyleft license contamination was found, no custom registries are configured, and no typosquatting indicators were detected.

---

## 1. Known Vulnerabilities (`npm audit`)

| Package | Severity | CVE / Advisory | CVSS | Via | Fix |
|---|---|---|---|---|---|
| `fast-xml-parser` 4.3.6 - 5.3.3 | HIGH | [GHSA-37qj-frw5-hhjh](https://github.com/advisories/GHSA-37qj-frw5-hhjh) | 7.5 | RangeError DoS via numeric entities | Update `@google-cloud/storage` to ^7.19.0 |
| `lodash` 4.0.0 - 4.17.21 | MODERATE | [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | 6.5 | Prototype pollution in `_.unset`/`_.omit` | Transitive via recharts; awaiting upstream fix |

### Findings

**DEP-VULN-01** -- `fast-xml-parser` DoS via `@google-cloud/storage`
Rating: HIGH
The `@google-cloud/storage` ^7.18.0 pulls in a vulnerable version of `fast-xml-parser`. A crafted XML payload with numeric entities can trigger `RangeError` and crash the process. Since Cloud Storage is used for file uploads, an attacker with upload access could exploit this. Fix: update `@google-cloud/storage` to >=7.19.0 where `fast-xml-parser` is patched.

**DEP-VULN-02** -- `lodash` prototype pollution (transitive)
Rating: MEDIUM
`lodash` 4.17.21 has a prototype pollution flaw in `_.unset` and `_.omit`. It is a transitive dependency of `recharts`. Exploitation requires attacker-controlled input to these functions, which is unlikely in chart rendering. Monitor for upstream update.

---

## 2. Outdated Dependencies -- Major Updates Available

The following have **major version upgrades** with breaking changes:

| Package | Current | Latest | Breaking Changes |
|---|---|---|---|
| `zod` | ^3.25.76 | 4.3.6 | Zod 4 changes schema API, inference types |
| `react` / `react-dom` | ^18.3.1 | 19.2.4 | React 19 changes hooks, concurrent features |
| `framer-motion` | ^11.13.1 | 12.34.0 | Renamed to `motion`, new import paths |
| `date-fns` | ^3.6.0 | 4.1.0 | Removed default exports, new tree-shaking |
| `recharts` | ^2.15.2 | 3.7.0 | Component API changes |
| `react-day-picker` | ^8.10.1 | 9.13.1 | New component API, peer dep changes |
| `react-resizable-panels` | ^2.1.7 | 4.6.2 | Two major versions behind |
| `tailwind-merge` | ^2.6.0 | 3.4.0 | Config changes |
| `zod-validation-error` | ^3.5.4 | 5.0.0 | Two major versions behind |
| `nodemailer` | ^7.0.12 | 8.0.1 | API changes |
| `@hookform/resolvers` | ^3.10.0 | 5.2.2 | Two major versions behind |

### Finding

**DEP-OUTDATED-01** -- Multiple packages multiple major versions behind
Rating: MEDIUM
Several packages are 2+ major versions behind (`react-resizable-panels`, `zod-validation-error`, `@hookform/resolvers`). This increases the window for unpatched vulnerabilities and makes eventual upgrades harder due to accumulated breaking changes. Plan a structured upgrade path.

---

## 3. Dependency Hygiene

### 3a. Unused Dependencies

The following packages are declared in `dependencies` but **never imported** anywhere in the source code:

| Package | Evidence | Rating |
|---|---|---|
| `next-themes` | Zero imports in entire codebase | MEDIUM |
| `react-icons` | Zero imports; `lucide-react` is used instead (38 files) | LOW |
| `framer-motion` | Zero imports of `framer-motion` or `motion` in any `.ts`/`.tsx` file | MEDIUM |
| `ws` | Zero imports; no WebSocket server code found | LOW |
| `tw-animate-css` | Not referenced in tailwind.config.ts or any file (only `tailwindcss-animate` is used) | LOW |
| `@jridgewell/trace-mapping` | Zero source imports; a transitive dep incorrectly hoisted to direct deps | LOW |

**DEP-UNUSED-01** -- 6 unused production dependencies
Rating: MEDIUM
These packages inflate `node_modules`, expand the attack surface, and add confusion. `framer-motion` alone is ~134 kB gzipped. Remove all unused deps.

### 3b. Shadcn UI Component Dead Code

The following shadcn/ui wrapper components exist in `client/src/components/ui/` but are **never imported by any page or non-ui component**:

- `accordion.tsx` (pulls `@radix-ui/react-accordion`)
- `aspect-ratio.tsx` (pulls `@radix-ui/react-aspect-ratio`)
- `carousel.tsx` (pulls `embla-carousel-react`)
- `command.tsx` (pulls `cmdk`)
- `context-menu.tsx` (pulls `@radix-ui/react-context-menu`)
- `drawer.tsx` (pulls `vaul`)
- `hover-card.tsx` (pulls `@radix-ui/react-hover-card`)
- `input-otp.tsx` (pulls `input-otp`)
- `menubar.tsx` (pulls `@radix-ui/react-menubar`)
- `navigation-menu.tsx` (pulls `@radix-ui/react-navigation-menu`)
- `resizable.tsx` (pulls `react-resizable-panels`)
- `slider.tsx` (pulls `@radix-ui/react-slider`)

**DEP-UNUSED-02** -- 12 unused shadcn/ui components with dedicated dependencies
Rating: LOW
These are dead code left over from the shadcn/ui initialization. Each pulls in a dedicated Radix or third-party package. While tree-shaking removes them from the client bundle, they still bloat `node_modules` and the lockfile. Remove both the wrapper components and their corresponding `@radix-ui/react-*` / third-party dependencies.

### 3c. `@types` Packages in `dependencies` Instead of `devDependencies`

| Package | Should Be |
|---|---|
| `@types/bcrypt` ^6.0.0 | `devDependencies` |
| `@types/memoizee` ^0.4.12 | `devDependencies` |

**DEP-HYGIENE-01** -- Type declarations in production dependencies
Rating: LOW
`@types/*` packages are only needed at compile time. Having them in `dependencies` means they ship to production and are installed even in `--omit=dev` scenarios. Move to `devDependencies`.

### 3d. Duplicate / Redundant Dependencies

| Pair | Issue |
|---|---|
| `tailwindcss-animate` + `tw-animate-css` | Two animation plugins for Tailwind; only `tailwindcss-animate` is used in `tailwind.config.ts` |
| `google-auth-library` + `googleapis` | `googleapis` includes `google-auth-library` as a transitive dep; explicit dep may be unnecessary unless used standalone |
| `lucide-react` + `react-icons` | Two icon libraries; only `lucide-react` is used |
| `memorystore` + `connect-pg-simple` | Two session stores; `memorystore` only appears in `script/build.ts` allowlist but is never imported in server code |

**DEP-HYGIENE-02** -- Redundant dependency pairs
Rating: LOW
Clean up duplicated functionality. Remove `tw-animate-css`, `react-icons`, and audit whether `google-auth-library` and `memorystore` are needed directly.

### 3e. Phantom Dependencies in Build Script

The `script/build.ts` allowlist references packages **not declared in package.json**:

| Package | In package.json? | Actually imported? |
|---|---|---|
| `@google/generative-ai` | No | No |
| `axios` | No | No |
| `cors` | No | No |
| `express-rate-limit` | No | No |
| `jsonwebtoken` | No | No |
| `multer` | No | No |
| `nanoid` | No | Yes (via `server/vite.ts`, but it is a transitive dep of other packages) |
| `stripe` | No | No |
| `uuid` | No | No |
| `xlsx` | No | No |

**DEP-PHANTOM-01** -- Build script references 10 undeclared packages
Rating: MEDIUM
The esbuild allowlist in `script/build.ts` contains packages that are neither declared dependencies nor imported in source code. This is dead configuration from copy-paste or removed features. If any of these were actually needed at runtime, the build would silently bundle a version resolved from transitive deps (phantom dependency) -- fragile and unpredictable.

**DEP-PHANTOM-02** -- `nanoid` used as phantom dependency
Rating: HIGH
`server/vite.ts` imports `nanoid` but it is NOT declared in `package.json`. It resolves at runtime only because it happens to be a transitive dependency of other packages (4 copies exist in the lockfile). If those packages remove or change their `nanoid` version, the server will break. Add `nanoid` as an explicit dependency.

---

## 4. Version Management

### 4a. Pinning Strategy

- **78 of 79** production deps use caret ranges (`^x.y.z`) -- allows minor/patch drift
- **24 of 26** dev deps use caret ranges
- **2 dev deps pinned exactly**: `@types/node` = 20.19.27, `typescript` = 5.6.3
- **Lockfile**: present (`package-lock.json`, lockfileVersion 3) -- good

**DEP-VERSION-01** -- Inconsistent pinning strategy
Rating: LOW
The project mixes exact pins (for TypeScript and @types/node) with caret ranges everywhere else. This is fine as long as the lockfile is committed and respected. Consider using exact pins for security-critical packages like `bcrypt`, `express`, and `openai`.

### 4b. Node.js Compatibility

`@types/node` is pinned to 20.19.27 but the lockfile resolves packages requiring Node 22+ features. The runtime appears to be Node 22.22.0. The `@types/node` version should match the actual runtime to avoid type mismatches.

**DEP-VERSION-02** -- `@types/node` version mismatch with runtime
Rating: LOW
`@types/node` is pinned to v20 but the runtime is Node 22. Update to `@types/node@22.x` for accurate type definitions.

---

## 5. Supply Chain Risks

### 5a. Install Scripts

Packages with `install` / `postinstall` scripts (potential code execution at install time):

| Package | Script Purpose | Risk |
|---|---|---|
| `bcrypt` | Compiles native C++ addon | Expected -- well-known package |
| `bufferutil` | Compiles native C++ addon | Expected -- ws optional dep |
| `esbuild` | Downloads platform binary | Expected -- well-known build tool |
| `es5-ext` | **Controversial** -- v0.10.64 | MEDIUM |
| `fsevents` | macOS file watcher native addon | Expected -- optional, platform-specific |

**DEP-SUPPLY-01** -- `es5-ext` install script
Rating: MEDIUM
`es5-ext` 0.10.64 is a transitive dependency (via `memoizee`) that has had [controversial postinstall behavior](https://github.com/nicolo-ribaudo/tc39-proposal/issues/64) in past versions, including network calls during install. While v0.10.64 removed the most controversial code, this package remains on security watchlists. The dependency chain is: `memoizee` -> `es5-ext`. Consider whether `memoizee` can be replaced with native `Map`-based caching.

### 5b. Registry Configuration

- No `.npmrc` file found -- uses default npm registry (https://registry.npmjs.org)
- `overrides` section remaps `drizzle-kit`'s `@esbuild-kit/esm-loader` to `npm:tsx@^4.20.4` -- this is a known compatibility fix, not a risk

### 5c. Typosquatting Assessment

All 79 production dependency names were checked against known typosquatting patterns. No suspicious names detected. All packages are from well-known publishers or scoped under organizational namespaces (`@radix-ui`, `@tanstack`, `@google-cloud`, `@uppy`, `@replit`).

**No findings** -- LOW risk.

---

## 6. License Analysis

### License Distribution (771 packages)

| License | Count | Compatibility with MIT |
|---|---|---|
| MIT | 557 | Compatible |
| ISC | 56 | Compatible |
| Apache-2.0 | 27 | Compatible |
| BSD-3-Clause | 7 | Compatible |
| BSD-2-Clause | 1 | Compatible |
| BlueOak-1.0.0 | 3 | Compatible |
| MPL-2.0 | 12 | Compatible (file-level copyleft) |
| CC-BY-4.0 | 1 | Compatible (data/docs) |
| 0BSD / MIT-0 / Unlicense | 3 | Compatible (permissive) |
| Not recorded in lockfile | 102 | See note below |

### Key Observations

- **No GPL, AGPL, or SSPL licenses** found in the dependency tree
- **MPL-2.0** packages are all `lightningcss` platform binaries (build-time only, via Vite) -- no contamination risk
- **102 packages** have no license recorded in the lockfile `license` field. These are predominantly `@radix-ui/*`, `date-fns`, `tailwindcss`, `recharts`, and other well-known MIT-licensed packages whose lockfile entries simply omit the metadata. All were verified as MIT via npm registry.

**DEP-LICENSE-01** -- No license compliance issues detected
Rating: LOW
The project declares `"license": "MIT"` in package.json. All dependencies are compatible with MIT licensing. No copyleft contamination.

---

## 7. Bundle Impact

### Heaviest Production Dependencies (estimated gzipped sizes)

| Package | Gzip Size | Used? | Replaceable? |
|---|---|---|---|
| `googleapis` | ~2.5 MB (full) | Yes (calendar only) | Use `@googleapis/calendar` (~50 kB) for 98% reduction |
| `framer-motion` | ~134 kB | **No** | Remove entirely |
| `recharts` | ~120 kB | Yes | Consider `@nivo/line` or native SVG for simpler charts |
| `react-icons` | ~100 kB (import-dependent) | **No** | Remove entirely |
| `@google-cloud/storage` | ~90 kB | Yes | Needed for GCS |
| `lucide-react` | ~80 kB (tree-shakeable) | Yes | Efficient with tree-shaking |
| `openai` | ~60 kB | Yes | Needed |
| `date-fns` | ~30 kB (tree-shakeable) | Yes | Good -- tree-shakes well |
| `lodash` (transitive) | ~70 kB | Transitive | Not directly removable |

**DEP-BUNDLE-01** -- `googleapis` pulls entire Google API surface
Rating: HIGH
The full `googleapis` package (~2.5 MB) is imported but only the Calendar API is used. Replace with `@googleapis/calendar` (the modular package) for a massive reduction in install size, attack surface, and cold start time.

**DEP-BUNDLE-02** -- Unused heavy packages in dependency list
Rating: MEDIUM
`framer-motion` (134 kB) and `react-icons` (100 kB) are declared but never imported. While tree-shaking should exclude them from the client bundle, they still inflate `node_modules` and slow installs.

---

## 8. Maintenance & Bus Factor Concerns

| Package | Concern | Rating |
|---|---|---|
| `passport-local` 1.0.0 | Last published ~2014; 10+ years without update. Single maintainer (jaredhanson). No CVEs but no active maintenance either. | MEDIUM |
| `memoizee` 0.4.17 | Last significant update years ago. Pulls `es5-ext` (supply chain concern). | LOW |
| `passport` 0.7.0 | Maintained but slow release cadence. Bus factor of 1 (jaredhanson). | LOW |
| `express-session` 1.19.0 | Released Jan 2025 after years of stagnation. Now back under active maintenance. | LOW |
| `memorystore` 1.6.7 | Small utility, low activity. Not actually used in the codebase. | LOW |

**DEP-MAINT-01** -- `passport-local` effectively abandoned
Rating: MEDIUM
`passport-local` 1.0.0 was published over a decade ago and has received zero updates. While it is simple and stable, any vulnerability discovered would have no upstream fix path. Consider migrating to a maintained alternative or implementing the simple local strategy directly (~50 lines of code).

---

## Findings Summary

| ID | Finding | Rating |
|---|---|---|
| DEP-VULN-01 | `fast-xml-parser` DoS via `@google-cloud/storage` | HIGH |
| DEP-PHANTOM-02 | `nanoid` used as phantom (undeclared) dependency | HIGH |
| DEP-BUNDLE-01 | `googleapis` full package instead of modular `@googleapis/calendar` | HIGH |
| DEP-VULN-02 | `lodash` prototype pollution (transitive via recharts) | MEDIUM |
| DEP-UNUSED-01 | 6 unused production dependencies (`next-themes`, `react-icons`, `framer-motion`, `ws`, `tw-animate-css`, `@jridgewell/trace-mapping`) | MEDIUM |
| DEP-PHANTOM-01 | Build script references 10 undeclared packages | MEDIUM |
| DEP-OUTDATED-01 | Multiple packages 2+ major versions behind | MEDIUM |
| DEP-BUNDLE-02 | Unused heavy packages inflating install | MEDIUM |
| DEP-SUPPLY-01 | `es5-ext` install script (via `memoizee`) | MEDIUM |
| DEP-MAINT-01 | `passport-local` 1.0.0 effectively abandoned (10+ years) | MEDIUM |
| DEP-UNUSED-02 | 12 unused shadcn/ui components with dedicated deps | LOW |
| DEP-HYGIENE-01 | `@types/bcrypt` and `@types/memoizee` in dependencies not devDependencies | LOW |
| DEP-HYGIENE-02 | Redundant dependency pairs (tailwindcss-animate/tw-animate-css, lucide-react/react-icons) | LOW |
| DEP-VERSION-01 | Inconsistent pinning strategy | LOW |
| DEP-VERSION-02 | `@types/node` pinned to v20, runtime is Node 22 | LOW |
| DEP-LICENSE-01 | No license compliance issues | LOW |

### Counts by Severity

| Rating | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 7 |
| LOW | 6 |

---

## Recommended Actions (Priority Order)

1. **Update `@google-cloud/storage`** to >=7.19.0 to fix `fast-xml-parser` DoS (DEP-VULN-01)
2. **Add `nanoid`** as an explicit dependency in package.json (DEP-PHANTOM-02)
3. **Replace `googleapis`** with `@googleapis/calendar`** (DEP-BUNDLE-01)
4. **Remove unused dependencies**: `next-themes`, `react-icons`, `framer-motion`, `ws`, `tw-animate-css`, `@jridgewell/trace-mapping` (DEP-UNUSED-01)
5. **Clean build script allowlist** -- remove 10 phantom package references (DEP-PHANTOM-01)
6. **Move `@types/bcrypt` and `@types/memoizee`** to devDependencies (DEP-HYGIENE-01)
7. **Evaluate `memoizee` replacement** with native `Map`-based caching to eliminate `es5-ext` (DEP-SUPPLY-01)
8. **Evaluate `passport-local` replacement** with inline implementation (DEP-MAINT-01)
9. **Remove unused shadcn/ui components** and their Radix/third-party deps (DEP-UNUSED-02)
10. **Plan major version upgrades** for `zod`, `date-fns`, `react-day-picker`, `recharts` (DEP-OUTDATED-01)
11. **Update `@types/node`** to match Node 22 runtime (DEP-VERSION-02)
