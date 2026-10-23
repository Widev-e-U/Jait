//! Graphify normalization and stable, undirected graph traversal.
//! Raw properties remain evidence; they are never interpreted as instructions.
use crate::{services::calendar::js_text, text::js_trim};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Clone, Debug, Serialize)]
pub struct ParsedGraph {
    pub nodes: Vec<Value>,
    pub edges: Vec<Value>,
    pub stats: Value,
}
fn string(record: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| match &record[*key] {
        Value::String(s) if !js_trim(s).is_empty() => Some(js_trim(s).into()),
        Value::Number(_) => Some(js_text(&record[*key])),
        _ => None,
    })
}
fn number(record: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|key| {
        let value = &record[*key];
        let n = if value.is_number() {
            value.as_f64()
        } else {
            value
                .as_str()
                .filter(|s| !js_trim(s).is_empty())
                .and_then(|s| {
                    let s = js_trim(s);
                    let radix = if s.starts_with("0x") || s.starts_with("0X") {
                        Some(16)
                    } else if s.starts_with("0o") || s.starts_with("0O") {
                        Some(8)
                    } else if s.starts_with("0b") || s.starts_with("0B") {
                        Some(2)
                    } else {
                        None
                    };
                    radix.map_or_else(
                        || s.parse::<f64>().ok(),
                        |radix| {
                            let mut n = 0.0;
                            if s.len() <= 2 {
                                return None;
                            }
                            for c in s[2..].chars() {
                                n = n * radix as f64 + c.to_digit(radix)? as f64;
                            }
                            Some(n)
                        },
                    )
                })
        };
        n.filter(|n| n.is_finite())
            .map(|n| json!(if n == 0.0 { 0.0 } else { n }))
    })
}
fn endpoint(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(_) => Some(js_text(value)),
        _ => string(value, &["id", "key", "name"]),
    }
}
fn field(record: &mut Value, key: &str, value: Option<impl Into<Value>>) {
    if let Some(value) = value {
        record[key] = value.into();
    }
}
fn increment(record: &mut Map<String, Value>, key: &str) {
    // Compatibility with the reference's ordinary-object counters, represented
    // strictly as inert JSON. This never creates or mutates a Rust prototype.
    if key == "__proto__" {
        return;
    }
    if let Some(text) = record.get(key).and_then(Value::as_str) {
        record.insert(key.into(), json!(format!("{text}1")));
        return;
    }
    if !record.contains_key(key) {
        let name = match key {
            "constructor" => Some("Object"),
            "toString"
            | "toLocaleString"
            | "valueOf"
            | "hasOwnProperty"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "__defineGetter__"
            | "__defineSetter__"
            | "__lookupGetter__"
            | "__lookupSetter__" => Some(key),
            _ => None,
        };
        if let Some(name) = name {
            record.insert(
                key.into(),
                json!(format!("function {name}() {{ [native code] }}1")),
            );
            return;
        }
    }
    let next = record.get(key).and_then(Value::as_u64).unwrap_or(0) + 1;
    record.insert(key.into(), json!(next));
}

pub fn parse_graph(raw: &Value) -> ParsedGraph {
    let mut nodes = vec![];
    let mut by_id = HashMap::new();
    for raw in raw["nodes"].as_array().into_iter().flatten() {
        let Some(id) = string(raw, &["id", "key", "name"]) else {
            continue;
        };
        if by_id.contains_key(&id) {
            continue;
        }
        let file_type = string(raw, &["file_type", "fileType"]);
        let mut node = json!({
            "id":id, "label":string(raw, &["label", "name", "title"]).unwrap_or_else(|| id.clone()),
            "type":string(raw, &["node_type", "nodeType", "kind", "type"]).or_else(||file_type.clone()).unwrap_or_else(||"unknown".into()),
            "degree":0, "properties":raw.as_object().cloned().unwrap_or_default()
        });
        field(&mut node, "fileType", file_type);
        field(
            &mut node,
            "sourceFile",
            string(raw, &["source_file", "sourceFile", "path", "file"]),
        );
        field(
            &mut node,
            "line",
            number(raw, &["line", "start_line", "startLine", "line_number"]),
        );
        field(&mut node, "endLine", number(raw, &["end_line", "endLine"]));
        field(
            &mut node,
            "community",
            string(
                raw,
                &["community", "community_id", "communityId", "cluster"],
            ),
        );
        by_id.insert(id, nodes.len());
        nodes.push(node);
    }
    let mut edges = vec![];
    for (index, raw) in raw["links"]
        .as_array()
        .or_else(|| raw["edges"].as_array())
        .into_iter()
        .flatten()
        .enumerate()
    {
        let Some(source) = endpoint(&raw["source"]).filter(|s| !s.is_empty()) else {
            continue;
        };
        let Some(target) = endpoint(&raw["target"]).filter(|s| !s.is_empty()) else {
            continue;
        };
        let (Some(&a), Some(&b)) = (by_id.get(&source), by_id.get(&target)) else {
            continue;
        };
        let relation = string(raw, &["relation", "type", "label", "kind"])
            .unwrap_or_else(|| "related_to".into());
        let confidence = raw["confidence"]
            .as_str()
            .map(|s| js_trim(s).to_uppercase())
            .unwrap_or_default();
        let confidence = match confidence.as_str() {
            "EXTRACTED" | "INFERRED" | "AMBIGUOUS" => confidence,
            _ => "UNKNOWN".into(),
        };
        let mut edge = json!({
            "id":string(raw, &["id", "key"]).unwrap_or_else(||format!("{source}->{target}:{relation}:{index}")),
            "source":source,"target":target,"relation":relation,"confidence":confidence,
            "properties":raw.as_object().cloned().unwrap_or_default()
        });
        field(
            &mut edge,
            "confidenceScore",
            number(raw, &["confidence_score", "confidenceScore", "weight"]),
        );
        field(
            &mut edge,
            "sourceFile",
            string(raw, &["source_file", "sourceFile", "file"]),
        );
        field(
            &mut edge,
            "line",
            number(raw, &["line", "source_line", "sourceLine", "line_number"]),
        );
        for n in [a, b] {
            nodes[n]["degree"] = json!(nodes[n]["degree"].as_u64().unwrap() + 1);
        }
        edges.push(edge);
    }
    let mut types = Map::new();
    let mut relations = Map::new();
    let mut confidence = json!({"EXTRACTED":0,"INFERRED":0,"AMBIGUOUS":0,"UNKNOWN":0});
    let mut communities = HashSet::new();
    for node in &nodes {
        increment(&mut types, node["type"].as_str().unwrap());
        if let Some(c) = node["community"].as_str() {
            communities.insert(c);
        }
    }
    for edge in &edges {
        increment(&mut relations, edge["relation"].as_str().unwrap());
        increment(
            confidence.as_object_mut().unwrap(),
            edge["confidence"].as_str().unwrap(),
        );
    }
    let stats = json!({"nodeCount":nodes.len(),"edgeCount":edges.len(),"communityCount":communities.len(),"nodeTypes":types,"relations":relations,"confidence":confidence});
    ParsedGraph {
        nodes,
        edges,
        stats,
    }
}
fn id(value: &Value) -> &str {
    value["id"].as_str().unwrap()
}
fn degree(value: &Value) -> f64 {
    value["degree"].as_f64().unwrap()
}
fn cap(value: Option<f64>, default: f64, min: f64, max: f64) -> f64 {
    let value = value.unwrap_or(default);
    if value.is_nan() {
        value
    } else {
        value.clamp(min, max)
    }
}
fn take_count(limit: f64) -> usize {
    if limit.is_nan() { 0 } else { limit as usize }
}
pub fn snapshot(graph: &ParsedGraph, index: &Value, limit: Option<f64>) -> Value {
    let max = cap(limit, 2000.0, 1.0, 10000.0);
    if graph.nodes.len() as f64 <= max {
        return json!({"index":index,"nodes":graph.nodes,"edges":graph.edges,"truncated":false});
    }
    let mut nodes = graph.nodes.clone();
    nodes.sort_by(|a, b| degree(b).total_cmp(&degree(a)));
    nodes.truncate(take_count(max));
    let ids: HashSet<_> = nodes.iter().map(id).collect();
    let edges: Vec<_> = graph
        .edges
        .iter()
        .filter(|e| {
            ids.contains(e["source"].as_str().unwrap())
                && ids.contains(e["target"].as_str().unwrap())
        })
        .collect();
    json!({"index":index,"nodes":nodes,"edges":edges,"truncated":true})
}
fn tokens(query: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "a", "an", "and", "are", "as", "at", "be", "by", "does", "for", "from", "how", "in", "is",
        "it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which",
        "who", "why", "with",
    ];
    query
        .to_lowercase()
        .split(|c: char| !c.is_ascii_lowercase() && !c.is_ascii_digit() && !"_$.-".contains(c))
        .filter(|s| s.len() > 1 && !STOP.contains(s))
        .map(str::to_owned)
        .collect()
}
fn score(node: &Value, tokens: &[String]) -> f64 {
    if tokens.is_empty() {
        return degree(node);
    }
    let label = node["label"].as_str().unwrap().to_lowercase();
    let ident = id(node).to_lowercase();
    let text = ["id", "label", "type", "sourceFile", "community"]
        .into_iter()
        .filter_map(|k| node[k].as_str())
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let mut score = 0.0;
    for t in tokens {
        score += if label == *t || ident == *t {
            20.0
        } else if label.starts_with(t) {
            10.0
        } else if label.contains(t) {
            7.0
        } else if ident.contains(t) {
            5.0
        } else if text.contains(t) {
            2.0
        } else {
            0.0
        };
    }
    score + (degree(node) / 100.0).min(1.0)
}
fn location(value: &Value) -> String {
    value["sourceFile"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|file| {
            let line = value["line"].as_f64().filter(|n| *n != 0.0);
            format!(
                " · {file}{}",
                line.map(|_| format!(":{}", js_text(&value["line"])))
                    .unwrap_or_default()
            )
        })
        .unwrap_or_default()
}
fn context(nodes: &[&Value], edges: &[&Value]) -> String {
    if edges.is_empty() {
        return nodes
            .iter()
            .take(40)
            .map(|n| {
                format!(
                    "{} ({}){}",
                    n["label"].as_str().unwrap(),
                    n["type"].as_str().unwrap(),
                    location(n)
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    let labels: HashMap<_, _> = nodes
        .iter()
        .map(|n| (id(n), n["label"].as_str().unwrap()))
        .collect();
    edges
        .iter()
        .take(80)
        .map(|e| {
            let a = e["source"].as_str().unwrap();
            let b = e["target"].as_str().unwrap();
            format!(
                "{} -[{}]-> {} [{}]{}",
                labels.get(a).copied().unwrap_or(a),
                e["relation"].as_str().unwrap(),
                labels.get(b).copied().unwrap_or(b),
                e["confidence"].as_str().unwrap(),
                location(e)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
pub fn query(
    graph: &ParsedGraph,
    index: &Value,
    text: &str,
    mode: Option<&str>,
    max_nodes: Option<f64>,
    max_depth: Option<f64>,
) -> Result<Value, String> {
    let text = js_trim(text);
    if text.is_empty() {
        return Err("query is required".into());
    }
    let tokens = tokens(text);
    let mut ranked: Vec<_> = graph
        .nodes
        .iter()
        .map(|n| (n, score(n, &tokens)))
        .filter(|(_, s)| *s > 0.0)
        .collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    ranked.truncate(5);
    let mut seeds: Vec<_> = ranked.iter().map(|(n, _)| *n).collect();
    if seeds.is_empty() {
        seeds = graph.nodes.iter().collect();
        seeds.sort_by(|a, b| degree(b).total_cmp(&degree(a)));
        seeds.truncate(3);
    }
    let max_nodes = cap(max_nodes, 120.0, 1.0, 1000.0);
    let depth = cap(max_depth, 2.0, 0.0, 8.0);
    let mut adjacency: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, e) in graph.edges.iter().enumerate() {
        adjacency
            .entry(e["source"].as_str().unwrap())
            .or_default()
            .push(i);
        adjacency
            .entry(e["target"].as_str().unwrap())
            .or_default()
            .push(i);
    }
    let mut selected: HashSet<&str> = seeds.iter().map(|n| id(n)).collect();
    let mut queue: VecDeque<_> = seeds.iter().map(|n| (id(n), 0usize)).collect();
    // JS Map overwrites duplicate IDs while retaining the first insertion order.
    let mut chosen = Vec::<usize>::new();
    let mut slots = HashMap::<&str, usize>::new();
    while !queue.is_empty() && (selected.len() as f64) < max_nodes {
        let (current, d) = queue.pop_front().unwrap();
        if d as f64 >= depth {
            continue;
        }
        for &i in adjacency.get(current).into_iter().flatten() {
            let edge = &graph.edges[i];
            if let Some(&slot) = slots.get(id(edge)) {
                chosen[slot] = i;
            } else {
                slots.insert(id(edge), chosen.len());
                chosen.push(i);
            }
            let a = edge["source"].as_str().unwrap();
            let b = edge["target"].as_str().unwrap();
            let next = if a == current { b } else { a };
            if !selected.insert(next) {
                continue;
            }
            queue.push_back((next, d + 1));
            if selected.len() as f64 >= max_nodes {
                break;
            }
        }
    }
    let nodes: Vec<_> = graph
        .nodes
        .iter()
        .filter(|n| selected.contains(id(n)))
        .collect();
    let edges: Vec<_> = chosen
        .into_iter()
        .map(|i| &graph.edges[i])
        .filter(|e| {
            selected.contains(e["source"].as_str().unwrap())
                && selected.contains(e["target"].as_str().unwrap())
        })
        .collect();
    let mut out = json!({"query":text,"mode":mode.unwrap_or("hybrid"),"context":context(&nodes,&edges),"nodes":nodes,"edges":edges});
    for k in ["graphVersion", "graphRagStatus"] {
        if let Some(v) = index.get(k) {
            out[k] = v.clone();
        }
    }
    Ok(out)
}
pub fn shortest_path(
    graph: &ParsedGraph,
    source: &str,
    target: &str,
    max_depth: Option<f64>,
) -> Value {
    let find = |text: &str| {
        let t = js_trim(text).to_lowercase();
        graph
            .nodes
            .iter()
            .find(|n| id(n).to_lowercase() == t)
            .or_else(|| {
                graph
                    .nodes
                    .iter()
                    .find(|n| n["label"].as_str().unwrap().to_lowercase() == t)
            })
            .or_else(|| {
                graph
                    .nodes
                    .iter()
                    .find(|n| n["label"].as_str().unwrap().to_lowercase().contains(&t))
            })
    };
    let (Some(source), Some(target)) = (find(source), find(target)) else {
        return Value::Null;
    };
    let mut adjacency: HashMap<&str, Vec<(&str, usize)>> = HashMap::new();
    for (i, e) in graph.edges.iter().enumerate() {
        let a = e["source"].as_str().unwrap();
        let b = e["target"].as_str().unwrap();
        adjacency.entry(a).or_default().push((b, i));
        adjacency.entry(b).or_default().push((a, i));
    }
    let max = cap(max_depth, 12.0, 1.0, 50.0);
    let mut visited = HashSet::from([id(source)]);
    let mut queue = VecDeque::from([(id(source), 0usize)]);
    let mut previous = HashMap::new();
    while let Some((current, depth)) = queue.pop_front() {
        if current == id(target) {
            break;
        }
        if depth as f64 >= max {
            continue;
        }
        for &(next, e) in adjacency.get(current).into_iter().flatten() {
            if visited.insert(next) {
                previous.insert(next, (current, e));
                queue.push_back((next, depth + 1));
            }
        }
    }
    if !visited.contains(id(target)) {
        return Value::Null;
    }
    let mut ids = vec![id(target)];
    let mut edges = vec![];
    let mut cursor = id(target);
    while cursor != id(source) {
        let Some(&(prev, e)) = previous.get(cursor) else {
            return Value::Null;
        };
        edges.push(&graph.edges[e]);
        ids.push(prev);
        cursor = prev;
    }
    ids.reverse();
    edges.reverse();
    let by_id: HashMap<_, _> = graph.nodes.iter().map(|n| (id(n), n)).collect();
    let nodes: Vec<_> = ids.iter().map(|i| by_id[i]).collect();
    json!({"source":source,"target":target,"nodes":nodes,"edges":edges})
}
