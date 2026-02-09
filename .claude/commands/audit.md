Conduct a full end-to-end codebase audit. Follow these steps exactly:

## Phase 0: Discovery
1. Map the codebase: `find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './_audit/*' | head -500` and `tree -L 3 --dirsfirst -I 'node_modules|.git|_audit'`
2. Read package.json/requirements.txt/Cargo.toml/go.mod to identify stack
3. Count lines: `find . \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' \) -not -path './node_modules/*' | xargs wc -l 2>/dev/null | tail -1`
4. Identify entry points, API routes, auth boundaries, env files, Docker setup
5. Check for existing lint/test config
6. Write everything to `_audit/00-codebase-map.md`

## Phase 1: Parallel Specialist Audit
Launch 7 sub-agents IN PARALLEL using the Task tool. Each is defined in `.claude/agents/`. Tell each: "Read _audit/00-codebase-map.md first. Audit EVERY file. Write to your designated output."

Launch simultaneously:
- security-auditor → `_audit/01-security.md`
- quality-auditor → `_audit/02-code-quality.md`
- performance-auditor → `_audit/03-performance.md`
- testing-auditor → `_audit/04-testing.md`
- production-auditor → `_audit/05-production-readiness.md`
- dependency-auditor → `_audit/06-dependencies.md`
- accessibility-auditor → `_audit/07-accessibility.md` (skip if backend-only)

## Phase 2: Five Recursive Verification Passes
Run sequentially after Phase 1:

**Pass 1 — Cross-Validation (3 parallel tasks):**
- Security × Quality findings → `_audit/pass1a-security-quality.md`
- Performance × Production-readiness → `_audit/pass1b-perf-prod.md`
- Testing × Security (is every security issue tested?) → `_audit/pass1c-test-security.md`

**Pass 2 — Critical Deep Dive:** Collect every 🔴 and 🟠 from all reports. Re-verify in source, grep for pattern instances, write copy-paste fixes, estimate hours → `_audit/pass2-critical-fixes.md`

**Pass 3 — Pattern Detection (2 parallel tasks):**
- Recurring systemic patterns → `_audit/pass3a-patterns.md`
- Files in codebase-map not mentioned in any report → `_audit/pass3b-gaps.md`

**Pass 4 — Gap Fill:** Audit every unaudited file against all 7 categories → `_audit/pass4-gap-fills.md`

**Pass 5 — Adversarial Sweep:** Re-read every source file. Think like a hacker + chaos engineer. Cross-component interactions, race conditions, business logic edge cases, unvalidated assumptions → `_audit/pass5-final-sweep.md`

## Phase 3: Final Report
Read all `_audit/*.md`. Generate `_audit/FINAL-AUDIT-REPORT.md`:
- Health score /100, issue counts by severity
- Top 10 critical findings with file:line, fix, effort
- Consolidated findings per category (deduplicated)
- Systemic patterns, remediation roadmap (Immediate/Sprint/Quarter/Long-term)
- Appendix: every file and which agent(s) reviewed it
