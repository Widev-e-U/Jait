//! Desktop host identity storage, scoped to an already-authorized directory handle.
//!
//! The caller must retain an exclusive desktop host lock for the entire lifetime
//! of this operation and the gateway. This module does not establish that lock,
//! authorize a directory, create a state directory, or start a gateway.
//! On Windows an equivalent handle-scoped implementation and ACL review are
//! required before this can be used; it deliberately fails closed there.
use std::io;

pub struct HostSecrets {
    jwt: String,
    hook: String,
}

impl HostSecrets {
    pub fn jwt(&self) -> &str {
        &self.jwt
    }
    pub fn hook(&self) -> &str {
        &self.hook
    }
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid desktop host secrets")
}

fn decode(bytes: &[u8]) -> io::Result<HostSecrets> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let read = |key: &str| -> io::Result<String> {
        let s = value
            .get(key)
            .and_then(serde_json::Value::as_str)
            .ok_or_else(invalid)?;
        if s.len() != 64
            || !s
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(invalid());
        }
        Ok(s.to_owned())
    };
    Ok(HostSecrets {
        jwt: read("jwt")?,
        hook: read("hook")?,
    })
}

#[cfg(unix)]
pub fn load_or_create(directory: &std::fs::File) -> io::Result<HostSecrets> {
    use std::{
        fs::File,
        io::{Read, Write},
        os::fd::{AsRawFd, FromRawFd},
    };

    // A directory handle pins the parent. O_NOFOLLOW rejects a symlink at the
    // final component; O_NONBLOCK prevents a hostile FIFO from hanging startup.
    fn open(directory: &File, flags: i32, mode: libc::mode_t) -> io::Result<File> {
        let fd = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                c"host-secrets.json".as_ptr(),
                flags | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
                mode,
            )
        };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(unsafe { File::from_raw_fd(fd) })
    }
    let mut file = match open(directory, libc::O_RDONLY, 0) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let mut random = [0u8; 64];
            getrandom::fill(&mut random)
                .map_err(|_| io::Error::other("Desktop secret generation failed"))?;
            let secrets = HostSecrets {
                jwt: hex::encode(&random[..32]),
                hook: hex::encode(&random[32..]),
            };
            // Exclusive creation prevents another host from replacing a secret.
            // A partial write is deliberately left invalid and fails closed later.
            let mut new_file = open(
                directory,
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                0o600,
            )?;
            let bytes =
                serde_json::to_vec(&serde_json::json!({"jwt": secrets.jwt, "hook": secrets.hook}))
                    .map_err(|_| io::Error::other("Desktop secret serialization failed"))?;
            new_file.write_all(&bytes)?;
            return Ok(secrets);
        }
        Err(e) => return Err(e),
    };
    if !file.metadata()?.is_file() {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take(4097).read_to_end(&mut bytes)?;
    if bytes.len() > 4096 {
        return Err(invalid());
    }
    decode(&bytes)
}

#[cfg(not(unix))]
pub fn load_or_create(_directory: &std::fs::File) -> io::Result<HostSecrets> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Desktop secret storage is unavailable on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_existing_values_without_echoing_secret() {
        let good = format!(
            r#"{{"jwt":"{}","hook":"{}","extra":1}}"#,
            "a".repeat(64),
            "0".repeat(64)
        );
        let secrets = decode(good.as_bytes()).unwrap();
        assert_eq!(secrets.jwt(), "a".repeat(64));
        assert_eq!(secrets.hook(), "0".repeat(64));
        for bad in [
            r#"{}"#.to_owned(),
            good.replace(&"a".repeat(64), &"A".repeat(64)),
            "invalid".into(),
        ] {
            assert_eq!(
                decode(bad.as_bytes()).err().unwrap().to_string(),
                "Invalid desktop host secrets"
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn stores_and_reuses_identity_and_rejects_symlinks() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/desktop-host-secrets-tests");
        std::fs::create_dir_all(&base).unwrap();
        let dir = base.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&dir).unwrap();
        let directory = std::fs::File::open(&dir).unwrap();
        let first = load_or_create(&directory).unwrap();
        let second = load_or_create(&directory).unwrap();
        assert_eq!(first.jwt(), second.jwt());
        assert_eq!(first.hook(), second.hook());
        let path = dir.join("host-secrets.json");
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::remove_file(&path).unwrap();
        symlink("missing", &path).unwrap();
        assert!(load_or_create(&directory).is_err());
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&dir).unwrap();
    }
}
