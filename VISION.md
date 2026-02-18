# Jait Vision & Architecture

> Just Another Intelligent Tool — but built right.

## Core Philosophy

Jait differentiates by treating **security, reliability, and control** as first-class product features — not afterthoughts. Every feature follows these principles:

1. **Predictable > Magical** — LLM for understanding, deterministic execution
2. **Secure by Default** — Least privilege, audited, cryptographically verifiable
3. **Human-in-the-Loop** — Autopilot earned through trust, not assumed
4. **Enterprise-Ready** — Multi-tenant, policy-driven, compliant from day one

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              JAIT PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Frontend   │  │   Backend    │  │   Worker     │  │   Temporal   │   │
│  │   (React)    │  │  (FastAPI)   │  │  (Python)    │  │   Server     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         └─────────────────┼─────────────────┼─────────────────┘            │
│                           │                 │                              │
│  ┌────────────────────────▼─────────────────▼────────────────────────┐    │
│  │                        CORE SERVICES                               │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│  │  │ LLM Router  │  │ Tool Engine │  │ Scheduler   │  │ Memory    │ │    │
│  │  │ (LangChain) │  │ (Sandboxed) │  │ (Temporal)  │  │ (Scoped)  │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     SECURITY & COMPLIANCE                          │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│  │  │ Secrets     │  │ Audit Log   │  │ Policy      │  │ Consent   │ │    │
│  │  │ Vault       │  │ (Signed)    │  │ Engine      │  │ Manager   │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                          DATA LAYER                                │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  PostgreSQL │ Redis (Cache) │ S3/Minio (Artifacts) │ Keychain    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Roadmap

### Phase 1: Foundation ✅ (Current)
- [x] Multi-provider LLM support (OpenAI, Anthropic, Ollama, Local)
- [x] Temporal-based cron scheduler
- [x] Basic tool execution
- [x] Chat interface with SSE streaming
- [x] Google OAuth authentication

### Phase 2: Security & Control 🔄 (Next)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Consent Manager** | Explicit approval for dangerous actions (send email, delete, shell) | P0 |
| **Audit Log** | Every action logged with who/what/why/tool/params | P0 |
| **Dry-Run Mode** | Agent shows plan + expected side-effects before execution | P0 |
| **Action IDs** | Unique IDs for idempotency, no double-sends | P1 |
| **Secrets Vault** | OS Keychain/TPM integration, per-tool scoped | P1 |

### Phase 3: Reliability & UX
| Feature | Description | Priority |
|---------|-------------|----------|
| **Action Cards** | Visual previews: emails, calendar, bookings with Approve/Reject | P0 |
| **Status Queue** | "Running", "Awaiting Approval", "Needs Input" visibility | P0 |
| **Quick Edits** | "Use Thursday instead of Tuesday" without restart | P1 |
| **Error Handling** | Retries, timeouts, circuit breakers, partial-fail reports | P1 |
| **Undo/Rollback** | Reverse actions where possible | P2 |

### Phase 4: Memory & Context
| Feature | Description | Priority |
|---------|-------------|----------|
| **Attributed Memory** | "I believe X because: Note Y / Email Z / File A" | P0 |
| **Scoped Memory** | Per workspace, per contact, per project (no mixing) | P0 |
| **Forget + TTL** | One-click forget, auto-expiring sensitive data | P1 |
| **Context Sources** | Files, emails, calendar as retrieval sources | P2 |

### Phase 5: Enterprise & Team
| Feature | Description | Priority |
|---------|-------------|----------|
| **Policy Engine** | Admin-defined: allowed tools, domains, time windows | P0 |
| **Multi-Tenancy** | Isolated workspaces, separate keys | P0 |
| **Role-Based Access** | User/Admin/Viewer roles per workspace | P1 |
| **SOC2 Readiness** | Technical controls for compliance | P2 |

### Phase 6: Verifiable Execution (Differentiator)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Signed Receipts** | Cryptographic proof of inputs/outputs/toolcalls | P0 |
| **Trust Levels** | Autopilot unlocked progressively per action type | P1 |
| **Compliance Export** | Audit trails for regulators/legal | P2 |

---

## Tool Permission Model

```yaml
# Example: Email Tool Permission
tool: send_email
permissions:
  allowed_domains: ["@company.com", "@partner.org"]
  max_recipients: 10
  requires_consent: true
  consent_level: "confirm"  # confirm | 2fa | passkey
  rate_limit: "10/hour"
  audit: true
  
# Example: File Tool Permission  
tool: file_operations
permissions:
  allowed_paths: ["~/Documents/Jait/*", "/tmp/*"]
  denied_paths: ["~/.ssh/*", "~/.aws/*"]
  operations: ["read", "write", "list"]  # no delete
  requires_consent_for: ["delete", "write_outside_workspace"]
```

---

## Action Flow: Human-in-the-Loop

```
User Request
     │
     ▼
┌─────────────┐
│ LLM Parse   │  ← Understand intent
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Plan Build  │  ← Deterministic workflow steps
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Dry Run     │────►│ Action Card  │  ← Show preview
└──────┬──────┘     │ + Side       │
       │            │   Effects    │
       ▼            └──────────────┘
┌─────────────┐            │
│ Await       │◄───────────┘
│ Consent     │
└──────┬──────┘
       │ (Approve)
       ▼
┌─────────────┐
│ Execute     │  ← Idempotent, with Action ID
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Log + Sign  │────►│ Audit Entry  │  ← Signed receipt
└──────┬──────┘     │ (Verifiable) │
       │            └──────────────┘
       ▼
┌─────────────┐
│ Report      │  ← Success/Partial/Fail with details
└─────────────┘
```

---

## Trust Level Progression

| Level | Name | Requirements | Capabilities |
|-------|------|--------------|--------------|
| 0 | **Observer** | New user | Read-only, suggestions only |
| 1 | **Assisted** | 10 approved actions | Execute with confirmation |
| 2 | **Trusted** | 50 actions, 0 reverts | Auto-execute safe actions |
| 3 | **Autopilot** | 200 actions, explicit opt-in | Auto-execute most actions |

Each action type has its own trust progression:
- Email: Level 2 needed for auto-send
- Calendar: Level 1 for suggestions, Level 2 for booking
- Files: Level 2 for write, Level 3 for delete
- Shell: Always requires Level 1+ consent

---

## Audit Log Schema

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Who
    user_id UUID REFERENCES users(id),
    session_id UUID,
    workspace_id UUID,
    
    -- What
    action_id UUID UNIQUE,  -- For idempotency
    action_type VARCHAR(50),  -- 'tool_call', 'consent', 'login', etc.
    tool_name VARCHAR(100),
    
    -- Details
    inputs JSONB,  -- Sanitized (no secrets)
    outputs JSONB,
    side_effects JSONB,  -- What changed
    
    -- Verification
    signature TEXT,  -- Ed25519 signature of canonical JSON
    parent_action_id UUID,  -- For action chains
    
    -- Status
    status VARCHAR(20),  -- 'pending', 'approved', 'executed', 'failed', 'reverted'
    consent_method VARCHAR(20),  -- 'auto', 'confirm', '2fa', 'passkey'
    
    -- Compliance
    retention_until DATE,
    gdpr_category VARCHAR(50)
);

CREATE INDEX idx_audit_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action_id ON audit_log(action_id);
```

---

## Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Workspace   │  │   Contact    │  │   Project    │          │
│  │   Memory     │  │   Memory     │  │   Memory     │          │
│  │              │  │              │  │              │          │
│  │ - Prefs      │  │ - History    │  │ - Goals      │          │
│  │ - Context    │  │ - Prefs      │  │ - Files      │          │
│  │ - Shortcuts  │  │ - Notes      │  │ - Decisions  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │  Retrieval  │                              │
│                    │  Engine     │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │                   MEMORY ENTRY                           │   │
│  │  {                                                       │   │
│  │    "fact": "Prefers morning meetings",                   │   │
│  │    "source": {"type": "email", "id": "abc123"},         │   │
│  │    "confidence": 0.9,                                    │   │
│  │    "scope": "contact:john@example.com",                  │   │
│  │    "ttl": "2026-12-31",  // or null for permanent       │   │
│  │    "can_forget": true                                    │   │
│  │  }                                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Design Principles

1. **Every mutating action returns an `action_id`** for tracking and idempotency
2. **All dangerous operations support `dry_run=true`** to preview effects
3. **Batch operations return partial results** with per-item status
4. **Rate limits are per-tool, per-user** with clear headers
5. **Errors include remediation hints** and retry guidance

```typescript
// Example: Send Email API Response
{
  "action_id": "act_abc123",
  "status": "awaiting_consent",
  "preview": {
    "to": ["john@example.com"],
    "subject": "Meeting Tomorrow",
    "body_preview": "Hi John, confirming our...",
    "side_effects": ["Will notify 1 recipient"]
  },
  "consent_url": "/actions/act_abc123/consent",
  "expires_at": "2026-02-18T23:00:00Z"
}
```

---

## Implementation Priorities (Q1 2026)

### This Sprint
1. Complete Temporal worker integration
2. Add basic audit logging (database, not signed yet)
3. Implement dry-run mode for cron jobs
4. Build Jobs UI with status queue

### Next Sprint
1. Consent manager for tool execution
2. Action cards for job results
3. Secrets vault (OS keychain integration)
4. Error handling with retries

### Following Sprint
1. Signed audit receipts
2. Trust level system
3. Memory scope foundation
4. Policy engine basics

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Action Success Rate | >95% | Reliability |
| Consent-to-Execute Time | <5s | UX |
| Zero double-executions | 100% | Idempotency |
| Audit coverage | 100% | Compliance |
| User-reported "surprising" actions | <1% | Predictability |

---

## Competitive Positioning

| Capability | OpenClaw | Others | Jait |
|------------|----------|--------|------|
| Security-first | Partial | Rarely | ✅ Core |
| Verifiable execution | ❌ | ❌ | ✅ Signed receipts |
| Human-in-the-loop | Optional | Optional | ✅ Default |
| Enterprise-ready | ❌ | Some | ✅ Day one |
| Provider flexibility | Limited | Varies | ✅ Any LLM |
| Memory attribution | ❌ | ❌ | ✅ Sourced |

---

## Technical Debt to Avoid

1. **No plaintext secrets** — Ever. Use vault from start.
2. **No "we'll add auth later"** — Every endpoint authenticated.
3. **No "trust the LLM"** — Always validate, sanitize, bound.
4. **No "users won't do that"** — Assume adversarial input.
5. **No "we'll add logging later"** — Audit from day one.

---

*"Make it secure, make it reliable, make it trustworthy — or don't make it at all."*
