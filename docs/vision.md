# Jait Vision

Jait is a local-first distributed assistant runtime for a user, their computer, and their trusted network.

It is built around a simple idea: an assistant should be able to understand and act within a real environment, not just chat in the abstract. That environment includes files, apps, browsers, devices, services, workspaces, and other reachable nodes on the user’s network.

Jait is not trying to be an invisible autopilot. It is trying to be a persistent, environment-aware system that helps a user operate more efficiently while remaining observable, steerable, and trustworthy.

## What Jait Is Trying To Be

Jait combines:

- a long-running gateway that owns sessions, tools, state, approvals, automation, and memory
- clients across web, desktop, and mobile
- a local execution model centered on the user’s machine
- a distributed node model that can extend across trusted devices and networked systems
- an assistant model that can learn a user’s environment and help across coding, operations, files, apps, and workflows

The goal is not “AI for everything.” The goal is a practical assistant runtime that can actually work inside a user’s real environment.

## Core Principles

1. Local-first by default.
   State, control, and execution should live as close to the user as possible.

2. Environment-aware, not prompt-only.
   Jait should understand the user’s actual environment: machines, files, services, apps, routines, and resources.

3. Predictable over magical.
   LLMs are useful for interpretation, planning, and adaptation, but execution should stay visible and bounded.

4. Human control where risk exists.
   Sensitive actions should be reviewable, interruptible, attributable, and policy-driven.

5. One runtime, many surfaces.
   The same system should power chat, coding, automation, device control, review flows, and long-running assistant behavior.

6. Generic core, opinionated product.
   Jait should be generic enough to adapt to different environments, while staying focused on operator control, real execution, and practical usefulness.

## Product Shape

At a high level, Jait has five layers:

- Clients
  Web, desktop, and mobile surfaces for chat, review, approvals, monitoring, and control.

- Gateway
  The control plane that manages sessions, assistants, providers, tools, permissions, memory, scheduling, persistence, and policy.

- Nodes and surfaces
  The user’s main computer and other trusted devices or machines, exposed through explicit capabilities such as terminal, filesystem, browser, screen, OS control, preview, and network operations.

- Resources and connectors
  Real environment objects such as workspaces, calendars, spreadsheets, files, mailboxes, internal services, and business systems, reached through typed integrations.

- Skills and plugins
  Skills teach behavior and workflows. Plugins add executable capabilities, connectors, providers, hooks, and other runtime extensions.

## The Core Loop

The core Jait loop is:

1. The user asks for a real task.
2. Jait plans against the actual environment.
3. Jait acts through tools, nodes, and connectors.
4. The user can observe progress, outputs, and side effects.
5. The user can approve, redirect, interrupt, or refine.
6. Jait retains useful context for future work.

That loop matters more than raw feature count.

## Architecture Priorities

The main architecture priorities are:

- a durable long-running gateway runtime
- explicit node and trust-zone modeling
- clear tool invocation and result streaming
- strong consent, audit, and policy enforcement
- durable local state and recoverability
- typed connectors for environment resources
- extension points for plugins and skills without losing control of the core system

## User Experience Priorities

The most important user-facing behaviors are:

- the assistant feels persistent rather than disposable
- actions are visible and attributable
- approvals are fast but explicit
- work resumes cleanly across disconnects and devices
- the system can adapt to the user’s environment instead of requiring the user to adapt to the system
- coding, operations, and personal workflow tasks all feel like part of one assistant runtime

## Security Priorities

Security is part of the product, not an add-on.

Important directions include:

- least-privilege execution paths
- explicit trust boundaries between gateway, nodes, resources, and plugins
- path, command, and network boundaries
- approval flows for risky actions
- auditable action history
- explicit provenance for tools, skills, plugins, and node-executed actions
- secret handling that does not depend on committed config files

## What Jait Is Not

Jait is not primarily trying to be:

- a generic hosted chat app
- a cloud-only SaaS that assumes central infrastructure
- an invisible autopilot that acts without review
- a single-IDE coding add-on
- a multi-tenant assistant platform for mutually untrusted strangers

## Near-Term Direction

The strongest near-term version of Jait is one that proves this model on a user’s own environment:

- coding workflows in real repositories
- review and acceptance of assistant-generated changes
- long-running session and thread coordination
- automation and scheduling tied to real tools and state
- cross-device visibility and approval handling
- safe expansion from one machine to a trusted network of nodes

## Tech Summary

Jait is a Bun and TypeScript monorepo with:

- Fastify in the gateway
- React in the web client
- shared schemas and types in workspace packages
- SQLite-backed local persistence
- tool and surface abstractions for execution
- an architecture moving toward assistants, nodes, resources, plugins, and skills as first-class concepts

## Documentation Boundary

This file is intentionally a public product and architecture statement, not an internal sprint log or exhaustive roadmap.

If a detail is primarily about implementation sequencing or short-lived planning, it should live elsewhere.
