# Jait Open-Source Launch Checklist

Use this checklist before making the repository public or announcing a release.

## Security

- [x] Source defaults use `localhost` instead of private LAN IPs
- [x] `.env.example` contains placeholders only
- [x] Run a secret scan such as `gitleaks detect --source .`
- [ ] Rotate credentials immediately if any real secret is found

## Source Cleanup

- [x] Sanitize machine-specific paths in public tests and examples
- [x] Remove internal deployment runbooks from the public repo
- [ ] Review remaining docs for private operational detail before launch

## Repository Metadata

- [x] Add root `README.md`
- [x] Add `CONTRIBUTING.md`
- [x] Add `SECURITY.md`
- [x] Add `CODE_OF_CONDUCT.md`
- [x] Add issue and pull request templates
- [x] Align workspace versions for the public release

## Quality Gate

- [x] `bun run lint` or equivalent local lint run
- [x] `bun run typecheck`
- [x] `bun run test`
- [ ] Run E2E checks for major UI changes

## Release

- [ ] Confirm package metadata and npm visibility
- [ ] Create the public release notes
- [ ] Verify `jait.dev` and related links point to public infrastructure
- [ ] Make the repository public
