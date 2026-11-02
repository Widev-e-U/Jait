//! Code-graph to GraphRAG projection and JSONL export. Call filesystem work on
//! a blocking lane with an output directory already authorized by the caller.
use crate::{
    contracts::ecmascript_json::JsonDocument,
    services::calendar::{js_text, truthy},
    time::{Clock, default_clock, iso},
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub degree: f64,
    pub properties: Map<String, Value>,
    #[serde(flatten)]
    pub location: Map<String, Value>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relation: String,
    pub confidence: String,
    pub confidence_score: Option<f64>,
    pub properties: Map<String, Value>,
    #[serde(flatten)]
    pub location: Map<String, Value>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphIndex {
    pub graph_version: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct GraphSnapshot {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub index: GraphIndex,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagData {
    pub entities: Vec<Value>,
    pub relationships: Vec<Value>,
    pub text_units: Vec<Value>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagExportManifest {
    pub schema_version: u8,
    pub graph_version: String,
    pub generated_at: String,
    pub entities_path: String,
    pub relationships_path: String,
    pub text_units_path: String,
    pub entity_count: usize,
    pub relationship_count: usize,
    pub text_unit_count: usize,
}
fn source_file(location: &Map<String, Value>) -> Option<&str> {
    location
        .get("sourceFile")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}
fn attributes(
    location: &Map<String, Value>,
    names: &[(&str, &str)],
    properties: &Map<String, Value>,
) -> Value {
    let mut attributes = Map::new();
    for (source, target) in names {
        if let Some(value) = location.get(*source) {
            attributes.insert((*target).into(), value.clone());
        }
    }
    for (key, value) in properties {
        attributes.insert(key.clone(), value.clone());
    }
    Value::Object(attributes)
}
pub fn to_graph_rag_data(snapshot: &GraphSnapshot) -> GraphRagData {
    let nodes: HashMap<_, _> = snapshot
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let mut file_entities = HashMap::<&str, Vec<&str>>::new();
    let mut file_relationships = HashMap::<&str, Vec<&str>>::new();
    let entities=snapshot.nodes.iter().enumerate().map(|(index,node)| {
        let source=source_file(&node.location);
        if let Some(source)=source { file_entities.entry(source).or_default().push(&node.id); }
        let location=source.map(|source| {
            let line=node.location.get("line").filter(|value|truthy(value));
            format!("{source}{}",line.map(|value|format!(":{}",js_text(value))).unwrap_or_default())
        }).unwrap_or_else(||"unknown source".into());
        json!({
            "id":node.id,"human_readable_id":index,"title":node.label,"type":node.kind,
            "description":format!("{} is a {} defined at {location}.",node.label,node.kind),
            "text_unit_ids":source.map(|source|vec![format!("file:{source}")]).unwrap_or_default(),
            "degree":node.degree,
            "attributes":attributes(&node.location,&[("sourceFile","source_file"),("line","line"),("endLine","end_line"),("community","community"),("fileType","file_type")],&node.properties)
        })
    }).collect();
    let relationships=snapshot.edges.iter().enumerate().map(|(index,edge)| {
        let source=nodes.get(edge.source.as_str());
        let target=nodes.get(edge.target.as_str());
        let file=source_file(&edge.location);
        if let Some(file)=file { file_relationships.entry(file).or_default().push(&edge.id); }
        let mut edge_attributes=Map::new();
        edge_attributes.insert("relation".into(),json!(edge.relation));
        edge_attributes.insert("confidence".into(),json!(edge.confidence));
        for (from,to) in [("sourceFile","source_file"),("line","line")] {
            if let Some(value)=edge.location.get(from) { edge_attributes.insert(to.into(),value.clone()); }
        }
        for (key,value) in &edge.properties { edge_attributes.insert(key.clone(),value.clone()); }
        json!({
            "id":edge.id,"human_readable_id":index,"source":edge.source,"target":edge.target,
            "description":format!("{} {} {}. Confidence: {}.",source.map(|node|node.label.as_str()).unwrap_or(&edge.source),edge.relation,target.map(|node|node.label.as_str()).unwrap_or(&edge.target),edge.confidence),
            "weight":edge.confidence_score.unwrap_or(if edge.confidence=="EXTRACTED"{1.0}else{0.6}),
            "combined_degree":source.map(|node|node.degree).unwrap_or(0.0)+target.map(|node|node.degree).unwrap_or(0.0),
            "text_unit_ids":file.map(|file|vec![format!("file:{file}")]).unwrap_or_default(),
            "attributes":edge_attributes
        })
    }).collect();
    let files: HashSet<_> = file_entities
        .keys()
        .chain(file_relationships.keys())
        .copied()
        .collect();
    let mut files: Vec<_> = files.into_iter().collect();
    files.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let text_units=files.into_iter().enumerate().map(|(index,file)| {
        let entity_ids=file_entities.get(file).cloned().unwrap_or_default();
        let relationship_ids=file_relationships.get(file).cloned().unwrap_or_default();
        let summary=entity_ids.iter().take(100).map(|id|nodes.get(id).map(|node|node.label.as_str()).unwrap_or(id)).collect::<Vec<_>>().join(", ");
        let text=format!("Source file: {file}\nSymbols: {summary}");
        let tokens=text.encode_utf16().count().div_ceil(4).max(1);
        json!({"id":format!("file:{file}"),"human_readable_id":index,"text":text,"n_tokens":tokens,
            "document_ids":[file],"entity_ids":entity_ids,"relationship_ids":relationship_ids,"covariate_ids":[]})
    }).collect();
    GraphRagData {
        entities,
        relationships,
        text_units,
    }
}
/// Canonical JS JSON encoding preserves numeric property ordering and f64 formatting.
pub fn json_lines(rows: &[Value]) -> String {
    let mut result = String::new();
    for row in rows {
        let wire = serde_json::to_string(row).expect("JSON data");
        result.push_str(
            &JsonDocument::parse(&wire)
                .expect("serialized JSON")
                .stringify(),
        );
        result.push('\n');
    }
    result
}
fn clean_join(directory: &Path, name: &str) -> PathBuf {
    let mut result = PathBuf::new();
    for component in directory.join(name).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if result.file_name().is_some_and(|name| name != "..") {
                    result.pop();
                } else if !result.has_root() {
                    result.push("..");
                }
            }
            value => result.push(value.as_os_str()),
        }
    }
    result
}
fn io_error(message: impl std::fmt::Display) -> io::Error {
    io::Error::other(message.to_string())
}
// Publish through a newly created sibling so a pre-existing leaf symlink or
// hard link is replaced rather than followed or truncated. The parent remains
// path-based and is not an authorized root capability (see SECURITY.md).
fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| io_error("missing export parent"))?;
    let temporary = parent.join(format!(".jait-export-{}", uuid::Uuid::new_v4()));
    let mut created = false;
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        created = true;
        file.write_all(contents)?;
        drop(file);
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() && created {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

/// Derive an export directory below a caller-authorized, pinned root.
/// The caller must prevent untrusted writes to every traversed directory, including
/// the root, throughout derivation and export. Descriptor-relative traversal does
/// not prevent an authorized directory from being moved by an external actor.
#[cfg(unix)]
pub fn open_export_namespace(root: &std::fs::File, components: &[&std::ffi::OsStr]) -> io::Result<std::fs::File> {
    use std::{ffi::CString, os::{fd::{AsRawFd, FromRawFd}, unix::ffi::OsStrExt}};
    if !root.metadata()?.is_dir() {
        return Err(io_error("export root capability is not a directory"));
    }
    let names = components.iter().map(|component| {
        let bytes = component.as_bytes();
        if bytes.is_empty() || bytes == b"." || bytes == b".." || bytes.contains(&b'/') {
            return Err(io_error("invalid export namespace component"));
        }
        CString::new(bytes).map_err(io_error)
    }).collect::<io::Result<Vec<_>>>()?;
    let mut current = root.try_clone()?;
    for name in names {
        let made = unsafe { libc::mkdirat(current.as_raw_fd(), name.as_ptr(), 0o700) };
        if made != 0 {
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::AlreadyExists { return Err(error); }
        }
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC) };
        if fd < 0 { return Err(io::Error::last_os_error()); }
        current = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    Ok(current)
}

/// Publish to an already-open directory authorized by the embedding caller.
/// The caller must pin the directory through its own trusted root capability and
/// ensure untrusted actors cannot modify entries in that directory during export.
/// Otherwise they can replace temporary names before rename or cleanup. The
/// display_directory is only used in the returned manifest and is not authority.
#[cfg(unix)]
pub fn write_graph_rag_export_in_directory(
    snapshot: &GraphSnapshot,
    directory: &std::fs::File,
    display_directory: &Path,
    clock: &Clock,
) -> io::Result<GraphRagExportManifest> {
    if !directory.metadata()?.is_dir() {
        return Err(io_error("export capability is not a directory"));
    }
    write_graph_rag_export_impl(snapshot, display_directory, clock, Some(directory))
}

#[cfg(unix)]
fn atomic_write_at(directory: &std::fs::File, name: &std::ffi::OsStr, contents: &[u8]) -> io::Result<()> {
    use std::{ffi::CString, io::Write, os::{fd::{AsRawFd, FromRawFd}, unix::ffi::OsStrExt}};
    let target = CString::new(name.as_bytes()).map_err(io_error)?;
    if name.as_bytes().contains(&b'/') || name.as_bytes() == b"." || name.as_bytes() == b".." || name.is_empty() {
        return Err(io_error("invalid export filename"));
    }
    let temporary = CString::new(format!(".jait-export-{}", uuid::Uuid::new_v4())).unwrap();
    let fd = unsafe { libc::openat(directory.as_raw_fd(), temporary.as_ptr(), libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC, 0o600) };
    if fd < 0 { return Err(io::Error::last_os_error()); }
    let mut file = unsafe { std::fs::File::from_raw_fd(fd) };
    let result = file.write_all(contents).and_then(|()| {
        if unsafe { libc::renameat(directory.as_raw_fd(), temporary.as_ptr(), directory.as_raw_fd(), target.as_ptr()) } == 0 {
            Ok(())
        } else { Err(io::Error::last_os_error()) }
    });
    if result.is_err() {
        unsafe { libc::unlinkat(directory.as_raw_fd(), temporary.as_ptr(), 0); }
    }
    result
}

pub fn write_graph_rag_export(
    snapshot: &GraphSnapshot,
    output_directory: &Path,
) -> io::Result<GraphRagExportManifest> {
    write_graph_rag_export_with_clock(snapshot, output_directory, &default_clock())
}
pub fn write_graph_rag_export_with_clock(
    snapshot: &GraphSnapshot,
    output_directory: &Path,
    clock: &Clock,
) -> io::Result<GraphRagExportManifest> {
    write_graph_rag_export_impl(snapshot, output_directory, clock, None)
}

fn write_graph_rag_export_impl(
    snapshot: &GraphSnapshot,
    output_directory: &Path,
    clock: &Clock,
    directory: Option<&std::fs::File>,
) -> io::Result<GraphRagExportManifest> {
    let version = snapshot
        .index
        .graph_version
        .as_ref()
        .filter(|version| !version.is_empty())
        .ok_or_else(|| {
            io_error("A versioned code graph is required before preparing GraphRAG data")
        })?;
    if output_directory.as_os_str().is_empty() {
        return Err(io::Error::from(io::ErrorKind::NotFound));
    }
    if directory.is_none() {
        std::fs::create_dir_all(output_directory)?;
    }
    let paths = [
        "entities.jsonl",
        "relationships.jsonl",
        "text_units.jsonl",
        "manifest.json",
    ]
    .map(|name| clean_join(output_directory, name));
    let prepared = to_graph_rag_data(snapshot);
    let manifest = GraphRagExportManifest {
        schema_version: 1,
        graph_version: version.clone(),
        generated_at: iso(clock()).map_err(io_error)?,
        entities_path: paths[0]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        relationships_path: paths[1]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        text_units_path: paths[2]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        entity_count: prepared.entities.len(),
        relationship_count: prepared.relationships.len(),
        text_unit_count: prepared.text_units.len(),
    };
    let contents = [
        json_lines(&prepared.entities),
        json_lines(&prepared.relationships),
        json_lines(&prepared.text_units),
        serde_json::to_string_pretty(&manifest).map_err(io_error)? + "\n",
    ];
    // All four writes are attempted, matching Promise.all's concurrent side effects.
    std::thread::scope(|scope| {
        let workers: Vec<_> = paths
            .iter()
            .zip(&contents)
            .map(|(path, contents)| scope.spawn(move || {
                #[cfg(unix)]
                if let Some(directory) = directory {
                    return atomic_write_at(directory, path.file_name().ok_or_else(|| io_error("missing export filename"))?, contents.as_bytes());
                }
                atomic_write(path, contents.as_bytes())
            }))
            .collect();
        let mut first_error = None;
        for worker in workers {
            let result = worker
                .join()
                .map_err(|_| io_error("export writer panicked"))
                .and_then(|result| result);
            if first_error.is_none() {
                first_error = result.err();
            }
        }
        first_error.map_or(Ok(()), Err)
    })?;
    Ok(manifest)
}

#[cfg(all(test, unix))]
mod atomic_write_tests {
    use super::atomic_write;
    use std::{fs, os::unix::fs::symlink, path::Path};

    #[test]
    fn namespace_rejects_links_and_invalid_components() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/export-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        let root = base.join("root");
        let outside = base.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let capability = fs::File::open(&root).unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        assert!(super::open_export_namespace(&capability, &["linked".as_ref(), "child".as_ref()]).is_err());
        assert!(!outside.join("child").exists());
        assert!(super::open_export_namespace(&capability, &["new".as_ref(), "..".as_ref()]).is_err());
        assert!(!root.join("new").exists());
        let namespace = super::open_export_namespace(&capability, &["owner".as_ref(), "export".as_ref()]).unwrap();
        super::atomic_write_at(&namespace, "entities.jsonl".as_ref(), b"safe").unwrap();
        assert_eq!(fs::read(root.join("owner/export/entities.jsonl")).unwrap(), b"safe");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pinned_directory_survives_path_replacement() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/export-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        let original = base.join("original");
        let moved = base.join("moved");
        let outside = base.join("outside");
        fs::create_dir_all(&original).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let directory = fs::File::open(&original).unwrap();
        fs::rename(&original, &moved).unwrap();
        symlink(&outside, &original).unwrap();
        super::atomic_write_at(&directory, "entities.jsonl".as_ref(), b"safe").unwrap();
        assert_eq!(fs::read(moved.join("entities.jsonl")).unwrap(), b"safe");
        assert!(!outside.join("entities.jsonl").exists());
        assert!(super::atomic_write_at(&directory, "../escape".as_ref(), b"no").is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pinned_export_api_uses_directory_after_path_replacement() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/export-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        let original = base.join("original");
        let moved = base.join("moved");
        let outside = base.join("outside");
        fs::create_dir_all(&original).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let directory = fs::File::open(&original).unwrap();
        fs::rename(&original, &moved).unwrap();
        symlink(&outside, &original).unwrap();
        let snapshot = super::GraphSnapshot {
            nodes: vec![],
            edges: vec![],
            index: super::GraphIndex { graph_version: Some("v1".into()) },
        };
        let manifest = super::write_graph_rag_export_in_directory(
            &snapshot, &directory, &original, &super::default_clock(),
        ).unwrap();
        assert_eq!(manifest.graph_version, "v1");
        for name in ["entities.jsonl", "relationships.jsonl", "text_units.jsonl", "manifest.json"] {
            assert!(moved.join(name).is_file(), "missing {name}");
            assert!(!outside.join(name).exists(), "escaped {name}");
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pinned_export_replaces_links_without_touching_target() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/export-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        let export = base.join("export");
        fs::create_dir_all(&export).unwrap();
        let target = base.join("target");
        let output = export.join("entities.jsonl");
        fs::write(&target, b"original").unwrap();
        let directory = fs::File::open(&export).unwrap();
        symlink(&target, &output).unwrap();
        super::atomic_write_at(&directory, "entities.jsonl".as_ref(), b"first").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        assert_eq!(fs::read(&output).unwrap(), b"first");
        fs::remove_file(&output).unwrap();
        fs::hard_link(&target, &output).unwrap();
        super::atomic_write_at(&directory, "entities.jsonl".as_ref(), b"second").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        assert_eq!(fs::read(&output).unwrap(), b"second");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn replaces_links_without_modifying_their_target() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/export-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&base).unwrap();
        let target = base.join("target");
        let output = base.join("output");
        fs::write(&target, b"original").unwrap();
        symlink(&target, &output).unwrap();
        atomic_write(&output, b"first").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        assert_eq!(fs::read(&output).unwrap(), b"first");
        fs::remove_file(&output).unwrap();
        fs::hard_link(&target, &output).unwrap();
        atomic_write(&output, b"second").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        assert_eq!(fs::read(&output).unwrap(), b"second");
        fs::remove_dir_all(base).unwrap();
    }
}
