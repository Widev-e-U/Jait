/*
 * libnsisredirect.c — LD_PRELOAD shim for relocating NSIS data files.
 *
 * Why: the `nsis` .deb ships its data tree (Stubs/, Plugins/, Include/) under
 * /usr/share/nsis, and makensis has that prefix *compiled in* — the NSISDIR
 * environment variable is ignored. Runners without root cannot populate
 * /usr/share/nsis, so makensis dies with "Error: reading stub ..." or cannot
 * find Include/MUI.nsh.
 *
 * Fix: preload this shim; it transparently rewrites any path that starts with
 * /usr/share/nsis to $NSIS_REAL_DIR. Everything else (absolute paths
 * elsewhere, OUTFILE writes, relative paths) passes through untouched. A
 * rewritten access that fails with ENOENT is retried on the original path, so
 * a partial NSIS_REAL_DIR tree degrades back to system paths. The makensis
 * self re-exec via system() inherits LD_PRELOAD, so both processes get the
 * rewrite.
 *
 * Build:   gcc -shared -fPIC -O2 -o libnsisredirect.so libnsisredirect.c -ldl
 * Usage:   NSIS_REAL_DIR=/path/to/nsis/data LD_PRELOAD=./libnsisredirect.so makensis ...
 *
 * Disabled (all functions pass through) when NSIS_REAL_DIR is unset.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define OLD_PREFIX "/usr/share/nsis"
#define OLD_PREFIX_LEN (sizeof(OLD_PREFIX) - 1)

static char g_new_prefix[4096];
static size_t g_new_prefix_len;
static int g_active;

__attribute__((constructor))
static void shim_init(void)
{
    const char *np = getenv("NSIS_REAL_DIR");
    size_t len;

    if (!np || !*np)
        return;
    len = strlen(np);
    if (len >= sizeof(g_new_prefix))
        return;
    memcpy(g_new_prefix, np, len + 1);
    while (len > 1 && g_new_prefix[len - 1] == '/')
        g_new_prefix[--len] = '\0';
    g_new_prefix_len = len;
    g_active = 1;
}

/* Returns rewritten path in buf, or NULL if path needs no rewrite. */
static const char *rewrite_path(const char *path, char *buf, size_t bufsz)
{
    size_t rest_len;
    int n;

    if (!path || !g_active)
        return NULL;
    if (strncmp(path, OLD_PREFIX, OLD_PREFIX_LEN) != 0)
        return NULL;
    rest_len = strlen(path + OLD_PREFIX_LEN);
    if (g_new_prefix_len + rest_len + 1 > bufsz)
        return NULL;
    n = snprintf(buf, bufsz, "%s%s", g_new_prefix, path + OLD_PREFIX_LEN);
    if (n < 0 || (size_t)n >= bufsz)
        return NULL;
    return buf;
}

/* Shared fallback: retry the original path after an ENOENT on the rewritten
 * one (int-returning calls). */
#define RETRY_ENOENT(rv, retry_call)                    \
    do {                                                \
        if ((rv) < 0 && rp && errno == ENOENT)          \
            (rv) = retry_call;                          \
    } while (0)

/* ── open family ────────────────────────────────────────────────────────── */

static int (*real_open)(const char *, int, ...);
static int (*real_open64)(const char *, int, ...);
static int (*real_openat)(int, const char *, int, ...);
static int (*real_openat64)(int, const char *, int, ...);

int open(const char *path, int flags, ...)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp;
    mode_t mode = 0644;
    int rv;
    va_list ap;

    if (!real_open)
        real_open = dlsym(RTLD_NEXT, "open");
    if (flags & O_CREAT) {
        va_start(ap, flags);
        mode = va_arg(ap, int);
        va_end(ap);
    }
    rp = rewrite_path(path, buf, sizeof(buf));
    rv = real_open(rp ? rp : path, flags, mode);
    RETRY_ENOENT(rv, real_open(path, flags, mode));
    return rv;
}

int open64(const char *path, int flags, ...)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp;
    mode_t mode = 0644;
    int rv;
    va_list ap;

    if (!real_open64)
        real_open64 = dlsym(RTLD_NEXT, "open64");
    if (flags & O_CREAT) {
        va_start(ap, flags);
        mode = va_arg(ap, int);
        va_end(ap);
    }
    rp = rewrite_path(path, buf, sizeof(buf));
    rv = real_open64(rp ? rp : path, flags, mode);
    RETRY_ENOENT(rv, real_open64(path, flags, mode));
    return rv;
}

int openat(int dirfd, const char *path, int flags, ...)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp;
    mode_t mode = 0644;
    int rv;
    va_list ap;

    if (!real_openat)
        real_openat = dlsym(RTLD_NEXT, "openat");
    if (flags & O_CREAT) {
        va_start(ap, flags);
        mode = va_arg(ap, int);
        va_end(ap);
    }
    rp = rewrite_path(path, buf, sizeof(buf));
    rv = real_openat(dirfd, rp ? rp : path, flags, mode);
    RETRY_ENOENT(rv, real_openat(dirfd, path, flags, mode));
    return rv;
}

int openat64(int dirfd, const char *path, int flags, ...)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp;
    mode_t mode = 0644;
    int rv;
    va_list ap;

    if (!real_openat64)
        real_openat64 = dlsym(RTLD_NEXT, "openat64");
    if (flags & O_CREAT) {
        va_start(ap, flags);
        mode = va_arg(ap, int);
        va_end(ap);
    }
    rp = rewrite_path(path, buf, sizeof(buf));
    rv = real_openat64(dirfd, rp ? rp : path, flags, mode);
    RETRY_ENOENT(rv, real_openat64(dirfd, path, flags, mode));
    return rv;
}

/* ── stat family ────────────────────────────────────────────────────────── */

static int (*real_stat)(const char *, struct stat *);
static int (*real_stat64)(const char *, struct stat64 *);
static int (*real_lstat)(const char *, struct stat *);
static int (*real_lstat64)(const char *, struct stat64 *);
static int (*real_xstat)(int, const char *, struct stat *);
static int (*real_xstat64)(int, const char *, struct stat64 *);
static int (*real_fxstatat)(int, int, const char *, struct stat *, int);
static int (*real_fxstatat64)(int, int, const char *, struct stat64 *, int);

int stat(const char *path, struct stat *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_stat)
        real_stat = dlsym(RTLD_NEXT, "stat");
    rv = real_stat(rp ? rp : path, st);
    RETRY_ENOENT(rv, real_stat(path, st));
    return rv;
}

int stat64(const char *path, struct stat64 *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_stat64)
        real_stat64 = dlsym(RTLD_NEXT, "stat64");
    rv = real_stat64(rp ? rp : path, st);
    RETRY_ENOENT(rv, real_stat64(path, st));
    return rv;
}

int lstat(const char *path, struct stat *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_lstat)
        real_lstat = dlsym(RTLD_NEXT, "lstat");
    rv = real_lstat(rp ? rp : path, st);
    RETRY_ENOENT(rv, real_lstat(path, st));
    return rv;
}

int lstat64(const char *path, struct stat64 *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_lstat64)
        real_lstat64 = dlsym(RTLD_NEXT, "lstat64");
    rv = real_lstat64(rp ? rp : path, st);
    RETRY_ENOENT(rv, real_lstat64(path, st));
    return rv;
}

/* Old glibc versioned wrappers (still referenced by some binaries). */
int __xstat(int ver, const char *path, struct stat *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_xstat)
        real_xstat = dlsym(RTLD_NEXT, "__xstat");
    if (!real_xstat)
        return stat(rp ? rp : path, st);
    rv = real_xstat(ver, rp ? rp : path, st);
    RETRY_ENOENT(rv, real_xstat(ver, path, st));
    return rv;
}

int __xstat64(int ver, const char *path, struct stat64 *st)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_xstat64)
        real_xstat64 = dlsym(RTLD_NEXT, "__xstat64");
    if (!real_xstat64)
        return stat64(rp ? rp : path, st);
    rv = real_xstat64(ver, rp ? rp : path, st);
    RETRY_ENOENT(rv, real_xstat64(ver, path, st));
    return rv;
}

int __fxstatat(int ver, int dirfd, const char *path, struct stat *st, int flags)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_fxstatat)
        real_fxstatat = dlsym(RTLD_NEXT, "__fxstatat");
    if (!real_fxstatat)
        return fstatat(dirfd, rp ? rp : path, st, flags);
    rv = real_fxstatat(ver, dirfd, rp ? rp : path, st, flags);
    RETRY_ENOENT(rv, real_fxstatat(ver, dirfd, path, st, flags));
    return rv;
}

int __fxstatat64(int ver, int dirfd, const char *path, struct stat64 *st, int flags)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_fxstatat64)
        real_fxstatat64 = dlsym(RTLD_NEXT, "__fxstatat64");
    if (!real_fxstatat64)
        return fstatat64(dirfd, rp ? rp : path, st, flags);
    rv = real_fxstatat64(ver, dirfd, rp ? rp : path, st, flags);
    RETRY_ENOENT(rv, real_fxstatat64(ver, dirfd, path, st, flags));
    return rv;
}

/* ── access family ──────────────────────────────────────────────────────── */

static int (*real_access)(const char *, int);
static int (*real_faccessat)(int, const char *, int, int);

int access(const char *path, int mode)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_access)
        real_access = dlsym(RTLD_NEXT, "access");
    rv = real_access(rp ? rp : path, mode);
    RETRY_ENOENT(rv, real_access(path, mode));
    return rv;
}

int faccessat(int dirfd, const char *path, int mode, int flags)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    int rv;

    if (!real_faccessat)
        real_faccessat = dlsym(RTLD_NEXT, "faccessat");
    rv = real_faccessat(dirfd, rp ? rp : path, mode, flags);
    RETRY_ENOENT(rv, real_faccessat(dirfd, path, mode, flags));
    return rv;
}

/* ── stdio / dirent ─────────────────────────────────────────────────────── */

static FILE *(*real_fopen)(const char *, const char *);
static FILE *(*real_fopen64)(const char *, const char *);
static void *(*real_opendir)(const char *);

FILE *fopen(const char *path, const char *m)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    FILE *fp;

    if (!real_fopen)
        real_fopen = dlsym(RTLD_NEXT, "fopen");
    fp = real_fopen(rp ? rp : path, m);
    if (!fp && rp && errno == ENOENT)
        fp = real_fopen(path, m);
    return fp;
}

FILE *fopen64(const char *path, const char *m)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    FILE *fp;

    if (!real_fopen64)
        real_fopen64 = dlsym(RTLD_NEXT, "fopen64");
    fp = real_fopen64(rp ? rp : path, m);
    if (!fp && rp && errno == ENOENT)
        fp = real_fopen64(path, m);
    return fp;
}

void *opendir(const char *path)
{
    char buf[sizeof(g_new_prefix) + 512];
    const char *rp = rewrite_path(path, buf, sizeof(buf));
    void *d;

    if (!real_opendir)
        real_opendir = dlsym(RTLD_NEXT, "opendir");
    d = real_opendir(rp ? rp : path);
    if (!d && rp && errno == ENOENT)
        d = real_opendir(path);
    return d;
}