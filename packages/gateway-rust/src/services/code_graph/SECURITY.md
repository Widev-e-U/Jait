# Code graph filesystem boundary

Graph reads traverse absolute paths with descriptor-relative opens and reject symlink components and non-regular files on Unix. Unsupported platforms fail closed. This is an intentional compatibility limitation; Windows and other non-Unix implementations need an equivalent reviewed boundary before use.

Graph reads reject files larger than 64 MiB, including files that grow beyond that limit during reading. This deliberately limits resource consumption and differs from the reference's unbounded read; the limit and error behavior require client compatibility review. This is only a read-side improvement. The data root is not pinned as an authorized capability: directory relocation, hard links and replacement of an ancestor before its open remain unresolved. Graphify output creation and GraphRAG export still use path-based filesystem operations and are not protected by this reader. Do not mount the service for untrusted filesystem access until root ownership, build and export effect authority, symlink and replacement races, and client compatibility are addressed. The lexical v2 namespace check continues to reject ambiguous legacy paths; it does not supply filesystem authority. No component coverage credit follows from this change.

## Authority integration required

The existing `Build` closure accepts strings, and `runner_build` adapts those
strings directly to `GraphifyRunner`. Neither type proves that an executor
confines the child. Likewise, `CodeGraphService` selects the export destination
as a path and calls the legacy path-based exporter. Do not wire these into an
untrusted runtime merely by passing an open directory alongside the strings.

An enforceable host integration must acquire a data-root directory capability
after authorization, derive and create the owner namespace relative to it
without following links, and retain descriptors through reads and publication.
The host must also supply a process sandbox that restricts Graphify's filesystem
and network access before executing any untrusted input; a cwd or argv path is
not such a sandbox. The host must separately authorize provisioning, project
reads, output writes and runtime/network effects. The current executor port has
no confinement proof and cannot establish those guarantees.

Replace the string `Build` handoff with a host-owned confined build operation
that accepts scoped capabilities and cancellation, returns output through the
pinned namespace, and supervises all descendants. The exporter capability needs
exclusive trusted control of directory entries while temporary files exist;
concurrent exports from the same service instance are serialized, including after caller cancellation; separate service instances and external writers remain uncoordinated. Serialization does not make the multiple published files an atomic bundle or establish directory authority.
Paths in stored indexes and export manifests are display metadata only and must
never be reopened as authority. Verify relocation, ancestor and leaf substitution,
hard links, concurrent publication, process escape, cancellation and unsupported
platform behavior before exposing the service. The existing implementation does
not yet satisfy these requirements.


A complete boundary needs an explicitly authorized, pinned data-root capability shared by the service, graph builder and exporter. Owner namespace derivation must select children relative to that capability. Directory creation, graph reads and GraphRAG publication must stay descriptor-relative, reject replacement and symlink races, and define an ownership policy for hard-linked files. A pinned read handle alone does not authorize the builder's or exporter's writes.

The current runner passes string paths to an external Graphify process after path-based directory creation. Confining that process requires a reviewed execution boundary that gives it only the authorized project and output authority; checking its reported output afterward cannot undo writes elsewhere. GraphRAG export likewise needs descriptor-relative temporary files and atomic publication, with cleanup on failure and cancellation. Root relocation, ancestor replacement, hard links, concurrent builds and cancellation require adversarial tests. The behavior of pre-existing symlinked data roots and non-Unix platforms also needs an explicit compatibility decision before runtime integration.

An additional Unix GraphRAG export API accepts an already-open directory from the caller and creates and renames files relative to that descriptor. The caller is responsible for obtaining and authorizing that descriptor through a trusted root; the display path in the manifest is not authority and can become stale after relocation. This API creates temporary files with mode 0600, deliberately narrowing the path-based API's default permissions. It is not wired into runtime. The focused `pinned_export_api_uses_directory_after_path_replacement` test passed 1/1 (execution `01a19986-c858-7652-9223-e421404ff24f`): all four outputs landed in the opened directory after its path was replaced by a symlink; it does not establish authorization or runtime integration. It does not confine Graphify or make four files a transaction.

GraphRAG output files are now individually published by creating a new sibling and renaming it over each destination. On Unix this avoids truncating a pre-existing destination symlink or hard link; replacement changes the destination inode and may change file metadata. The four-file export is not an atomic transaction. Parent directories and temporary names remain path-based and unpinned, so a hostile directory can race publication; this is not root authority. Replacement behavior on non-Unix platforms remains unverified.
