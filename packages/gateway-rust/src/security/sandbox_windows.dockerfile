# syntax=docker/dockerfile:1
FROM dockurr/windows:latest

# Default VM configuration for the Jait Windows sandbox.  All values can be
# overridden at runtime with -e (e.g. -e RAM_SIZE=8G -e CPU_CORES=8).
ENV VERSION="11" \
    RAM_SIZE="6G" \
    CPU_CORES="4" \
    DISK_SIZE="64G"

EXPOSE 3389 8006
