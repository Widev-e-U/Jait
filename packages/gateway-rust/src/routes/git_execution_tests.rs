
#[cfg(all(test,unix))]
mod tests{
 use super::*;
 fn test_root()->PathBuf{
    let root=Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/implementation-resume/route-batch/git-execution-tests").join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).unwrap();root.canonicalize().unwrap()
 }
 fn scoped(root:PathBuf,command_authority:GitCommandAuthority)->Context{
    let (pool,lane)=lanes();
    Context{owner:"owner".into(),operation:"status".into(),grant:GitGrant{owner:"owner".into(),root,command_authority,allow_worktree_reads:true},pool,lane,cancel:ProcessCancellation::default(),deadline:Instant::now()+Duration::from_secs(10),commands:Arc::new(AtomicUsize::new(0))}
 }
 fn grant_command()->GitCommandAuthority{
    Arc::new(|request,_|Box::pin(async move{
       assert_eq!(request.owner,"owner");assert_eq!(request.operation,"status");
       Ok(ProcessRequest{argv:std::iter::once("/usr/bin/git".into()).chain(request.arguments).collect(),cwd:request.cwd,environment:HashMap::new(),input:request.input,timeout:Duration::from_secs(1),output_limit:1024})
    }))
 }
 #[tokio::test]
 async fn commands_need_scope_and_exact_grants(){
    assert_eq!(Command::new("git").args(["--version"]).output().err().unwrap().kind(),io::ErrorKind::PermissionDenied);
    let root=test_root();let context=scoped(root.clone(),grant_command());
    let output=REQUEST_CONTEXT.scope(context,blocking(move||Command::new("git").args(["--version"]).output())).await.unwrap().unwrap();
    assert!(output.status.success());assert!(String::from_utf8_lossy(&output.stdout).starts_with("git version "));
    let bad:GitCommandAuthority=Arc::new(|request,_|Box::pin(async move{
       Ok(ProcessRequest{argv:vec!["/usr/bin/git".into(),"--help".into()],cwd:request.cwd,environment:HashMap::new(),input:request.input,timeout:Duration::from_secs(1),output_limit:1024})
    }));
    let context=scoped(root.clone(),bad);
    let denied=REQUEST_CONTEXT.scope(context,blocking(move||Command::new("git").args(["--version"]).output())).await.unwrap().err().unwrap();
    assert_eq!(denied.kind(),io::ErrorKind::PermissionDenied);
    std::fs::remove_dir_all(root).unwrap();
 }
 #[tokio::test]
 async fn worktree_reads_are_bounded_and_cannot_escape(){
    let root=test_root();std::fs::write(root.join("file"),b" original \n").unwrap();
    std::os::unix::fs::symlink("/etc/passwd",root.join("escape")).unwrap();
    let context=scoped(root.clone(),grant_command());let cwd=root.to_string_lossy().into_owned();
    REQUEST_CONTEXT.scope(context,blocking(move||{
       assert_eq!(read_worktree_file(&cwd,"file").unwrap()," original \n");
       assert_eq!(read_worktree_file(&cwd,"../outside").unwrap_err().kind(),io::ErrorKind::PermissionDenied);
       assert_eq!(read_worktree_file(&cwd,"escape").unwrap_err().kind(),io::ErrorKind::PermissionDenied);
    })).await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
 }
 #[tokio::test]
 async fn default_routes_deny_before_any_process_and_owner_mismatch_is_rejected(){
    use crate::{services::users::UserService,security::http_auth::{AuthUser,sign_auth_token}};
    let db=rusqlite::Connection::open_in_memory().unwrap();crate::db::migrate_database(&db).unwrap();
    let owner=UserService::new(&db).create_user_with_hash("git-owner","test-hash").unwrap();
    let secret="git-test-secret-long-enough-for-auth";
    let token=sign_auth_token(&AuthUser{id:owner.id,username:owner.username},secret).unwrap();
    let auth=super::super::auth::AuthState::new(db,secret.into()).unwrap();
    let root=test_root();
    let request=|base:String,token:String,root:PathBuf|async move{
       reqwest::Client::builder().timeout(Duration::from_secs(3)).build().unwrap().post(format!("{base}/api/git/status")).bearer_auth(token).json(&serde_json::json!({"cwd":root})).send().await.unwrap().status().as_u16()
    };
    let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let base=format!("http://{}",listener.local_addr().unwrap());
    let router=super::super::GitRoutes::new(auth.clone()).router();let task=tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});
    assert_eq!(request(base,token.clone(),root.clone()).await,503);task.abort();
    let grant_root=root.clone();
    let authority:GitAuthority=Arc::new(move|_,_|{let root=grant_root.clone();Box::pin(async move{Ok(GitGrant{owner:"different-owner".into(),root,command_authority:grant_command(),allow_worktree_reads:false})})});
    let router=super::super::GitRoutes::new(auth.clone()).with_authority(authority).router();
    let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let base=format!("http://{}",listener.local_addr().unwrap());let task=tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});
    assert_eq!(request(base,token,root.clone()).await,403);task.abort();auth.shutdown().await.unwrap();std::fs::remove_dir_all(root).unwrap();
 }
}
