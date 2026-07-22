#!/usr/bin/env bash
set -u -o pipefail

MAX_ATTEMPTS="${RELEASE_GIT_MAX_ATTEMPTS:-5}"
RETRY_DELAY_SECONDS="${RELEASE_GIT_RETRY_DELAY_SECONDS:-5}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "RELEASE_GIT_MAX_ATTEMPTS must be a positive integer" >&2
  exit 64
fi

if ! [[ "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "RELEASE_GIT_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
  exit 64
fi

find_ca_bundle() {
  if [ -n "${RELEASE_GIT_CA_BUNDLE:-}" ]; then
    if [ ! -r "$RELEASE_GIT_CA_BUNDLE" ]; then
      echo "Configured CA bundle is not readable: $RELEASE_GIT_CA_BUNDLE" >&2
      return 1
    fi
    printf '%s\n' "$RELEASE_GIT_CA_BUNDLE"
    return 0
  fi

  local candidate
  for candidate in \
    /etc/ssl/certs/ca-certificates.crt \
    /etc/pki/tls/certs/ca-bundle.crt \
    /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem \
    /etc/ssl/ca-bundle.pem \
    /etc/ssl/cert.pem
  do
    if [ -r "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "No readable system CA bundle found" >&2
  return 1
}

CA_BUNDLE="$(find_ca_bundle)" || exit 69
export GIT_SSL_CAINFO="$CA_BUNDLE"

git_tls() {
  git -c http.sslVerify=true -c "http.sslCAInfo=$CA_BUNDLE" "$@"
}

retry_delay() {
  local attempt="$1"
  if [ "$RETRY_DELAY_SECONDS" -gt 0 ]; then
    sleep "$((RETRY_DELAY_SECONDS * attempt))"
  fi
}

tag_exists() {
  local tag="$1"
  local attempt
  local status

  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    if git_tls ls-remote --exit-code --tags origin "refs/tags/$tag"; then
      return 0
    else
      status=$?
    fi

    if [ "$status" -eq 2 ]; then
      return 1
    fi

    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      echo "Git tag lookup failed (attempt $attempt/$MAX_ATTEMPTS, status $status); retrying" >&2
      retry_delay "$attempt"
    fi
  done

  echo "Unable to verify tag $tag after $MAX_ATTEMPTS attempts" >&2
  return 70
}

push_tag() {
  local tag="$1"
  local attempt
  local status

  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    if git_tls push origin "refs/tags/$tag"; then
      return 0
    else
      status=$?
    fi

    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      echo "Git tag push failed (attempt $attempt/$MAX_ATTEMPTS, status $status); retrying" >&2
      retry_delay "$attempt"
    fi
  done

  echo "Unable to push tag $tag after $MAX_ATTEMPTS attempts" >&2
  return 70
}

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <tag-exists|push-tag> <tag>" >&2
  exit 64
fi

case "$1" in
  tag-exists)
    tag_exists "$2"
    ;;
  push-tag)
    push_tag "$2"
    ;;
  *)
    echo "Unknown command: $1" >&2
    exit 64
    ;;
esac
