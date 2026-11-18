//! Linux OpenCode auth.json storage. Run filesystem operations in a blocking lane.
use crate::{services::storage::json_text, text::js_trim};
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};
#[derive(Clone)]
pub struct CredentialPaths {
    pub xdg_data_home: Option<String>,
    pub home: Option<String>,
    pub system_home: PathBuf,
}
impl CredentialPaths {
    pub fn auth_path(&self) -> PathBuf {
        let data = self
            .xdg_data_home
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                self.home
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .map(PathBuf::from)
                    .unwrap_or_else(|| self.system_home.clone())
                    .join(".local/share")
            });
        data.join("opencode/auth.json")
    }
}
const READ_ERROR: &str =
    "OpenCode credentials could not be read. Existing credentials were preserved.";
fn read_auth(path: &Path) -> Result<Value, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(json!({})),
        Err(_) => return Err(READ_ERROR.into()),
    };
    let parsed: Value =
        serde_json::from_str(&String::from_utf8_lossy(&bytes)).map_err(|_| READ_ERROR)?;
    if !parsed.is_object() {
        return Err(READ_ERROR.into());
    }
    Ok(parsed)
}
pub fn read_go_credential(paths: &CredentialPaths) -> Result<Option<String>, String> {
    let auth = read_auth(&paths.auth_path())?;
    let item = &auth["opencode-go"];
    Ok((item["type"] == "api")
        .then(|| {
            item["key"]
                .as_str()
                .map(js_trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .flatten())
}
pub fn has_go_credential(paths: &CredentialPaths) -> bool {
    read_go_credential(paths).ok().flatten().is_some()
}
pub fn set_go_credential(key: Option<&str>, paths: &CredentialPaths) -> Result<(), String> {
    let path = paths.auth_path();
    let mut auth = read_auth(&path)?;
    let object = auth.as_object_mut().expect("object checked");
    if let Some(key) = key {
        object.insert("opencode-go".into(), json!({"type":"api","key":key}));
    } else {
        object.shift_remove("opencode-go");
    }
    let directory = path.parent().expect("auth parent");
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true).mode(0o700);
        builder.create(directory).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let temporary = path.with_file_name(format!("auth.json.{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> io::Result<()> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(json_text(&auth).as_bytes())?;
        fs::rename(&temporary, &path)
    })();
    let cleanup = fs::remove_file(&temporary);
    result.map_err(|e| e.to_string())?;
    if let Err(e) = cleanup
        && e.kind() != io::ErrorKind::NotFound
    {
        return Err(e.to_string());
    }
    Ok(())
}
