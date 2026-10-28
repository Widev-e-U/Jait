//! Design boundary for caller-owned desktop smoke cleanup; no adapter is supplied.
//!
//! `smoke_cleanup::ScopedCleanup` accepts an operation, but neither that trait
//! nor the desktop smoke reference owns the namespace for its entire lifetime.
//! A directory handle alone does not provide an atomic "unlink this particular
//! inode if still named here" operation on ordinary Unix filesystems. A check of
//! a name followed by `unlinkat`, including an inode comparison, can delete a
//! replacement. An open directory can also be moved outside the intended tree
//! while its contents are being removed. Following no symlinks prevents link
//! traversal but does not solve those races. An ambient path, canonicalization,
//! a random name, or a process-local mutex is not sufficient authority.
//!
//! # Required owner interface
//!
//! The future smoke lifecycle owner, not an arbitrary path consumer, must create
//! and retain the scope before starting the child. A proposed interface (names
//! are illustrative and deliberately not executable) is:
//!
//! ```text
//! SmokeOwner::create(trusted_parent_capability, limits) -> Result<SmokeOwner>
//! SmokeOwner::start_child(&mut self, ...) -> Result<ChildLease>
//! SmokeOwner::stop_and_join(&mut self, child: ChildLease) -> Result<QuiescentScope>
//! QuiescentScope::remove_step(&mut self, budget, cancellation) -> StepResult
//! // StepResult: Complete | More | Cancelled | Failed(error)
//! ```
//!
//! `create` exclusively creates the root under an already trusted parent and
//! retains platform handles and the identity needed to remove it. No constructor
//! accepts a cleanup path from a request. The owner must enforce, not merely
//! assert, that untrusted actors cannot rename, replace, mount over, or mutate
//! entries in the root or its parent during cleanup; this includes other
//! processes with equivalent OS credentials and surviving child descendants.
//! A cooperative mutex or permissions that those actors can bypass do not meet
//! this requirement. If this isolation cannot be established, return an error
//! and leave the directory intact. `stop_and_join` must account for descendants
//! and outstanding filesystem work; an unsuccessful stop must not yield the
//! quiescent capability. The capability is exclusive and cannot be forged or
//! cloned by ordinary callers. Its ownership and cleanup state remain with the
//! supervisor across cancellation and retries.
//!
//! An implementation must use anchored directory capabilities throughout,
//! refuse symlinks and platform-specific reparse points as traversal targets,
//! avoid crossing mounts or volume boundaries, and remove links themselves only
//! within the owned namespace. It must reject unexpected objects or lost
//! isolation rather than fall back to path-based recursive deletion. Root
//! removal must be protected against name replacement too; checking identity
//! immediately before deletion does not make that operation atomic. A missing
//! owned root is success only when the owner can establish that it was removed,
//! not when it was moved away or replaced. Partial removal must be resumable.
//!
//! Each step needs explicit entry, depth, time and resource budgets, cancellation
//! checks between bounded operations, and a retained cursor or safe rescan. No
//! task may be detached on cancellation: join any blocking worker before
//! releasing the capability, and report partial progress without claiming
//! success. Filesystem calls can block beyond a deadline; a platform that cannot
//! bound and supervise them must report that limitation, not promise a hard
//! deadline. The retry policy in `smoke_cleanup` can only wrap a step or complete
//! attempt after its cancellation and ownership semantics are reconciled.
//!
//! Unix descriptor-relative APIs and Windows handle/reparse-point facilities
//! differ; neither this design nor the existing retry policy establishes the
//! necessary isolation on any platform. Unsupported or unverified platforms
//! must fail closed. Before integration, test adversarial ancestor and child
//! rename/replacement, symlinks and reparse points, mount boundaries, surviving
//! processes, resource limits, cancellation and retry after partial deletion.
//! Compare reference retry/warning behavior separately and document deliberate
//! differences. This file grants no filesystem authority and claims no coverage.
