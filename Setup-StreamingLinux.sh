#!/bin/sh
# Run only after a native Linux boot. Installs runtime dependencies, not an OS
# or graphics driver. No disks, bootloader, Windows files or firewall rules change.
set -eu
if [ "$(uname -s)" != Linux ] || uname -r | grep -qi microsoft; then
    echo 'Boot native Linux first; Windows/WSL is not the selected GPU host.' >&2
    exit 1
fi
if [ "${1:-}" != --install ]; then
    echo 'Usage: sudo sh Setup-StreamingLinux.sh --install'
    echo 'Installs Docker Engine/Compose and NVIDIA Container Toolkit from official repositories.'
    echo 'Requires a working NVIDIA graphics driver already installed on native Linux.'
    exit 1
fi
if [ "$(id -u)" != 0 ]; then
    echo 'Use sudo for the runtime package installation.' >&2
    exit 1
fi
if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi --query-gpu=name --format=csv,noheader; then
    echo 'Configure the native Linux NVIDIA driver first. This helper does not replace graphics drivers.' >&2
    exit 1
fi
. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
    ubuntu:*|pop:*ubuntu*) task_distribution=ubuntu ;;
    debian:*) task_distribution=debian ;;
    *) echo 'This package helper supports Ubuntu, Pop!_OS and Debian only.' >&2; exit 1 ;;
esac
task_codename=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}
case "$task_codename" in ''|*[!a-z]*) echo 'Cannot identify a supported repository codename.' >&2; exit 1 ;; esac
apt-get update
apt-get install -y ca-certificates curl gnupg python3 iproute2
install -m 0755 -d /etc/apt/keyrings
curl -fSL "https://download.docker.com/linux/$task_distribution/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
task_architecture=$(dpkg --print-architecture)
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$task_distribution
Suites: $task_codename
Components: stable
Architectures: $task_architecture
Signed-By: /etc/apt/keyrings/docker.asc
EOF
task_setup_dir=$(mktemp -d /tmp/zero-hour-linux.XXXXXX)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey -o "$task_setup_dir/nvidia-toolkit.asc"
gpg --dearmor --yes --output /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg "$task_setup_dir/nvidia-toolkit.asc"
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list -o "$task_setup_dir/nvidia-toolkit.list"
sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' "$task_setup_dir/nvidia-toolkit.list" > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker
docker info --format '{{.OSType}}'
echo 'Linux container dependencies installed. GPU capability and game performance still require the project preflight.'
echo 'Use sudo sh Test-StreamingGPU.sh --game-directory /actual/Data/path --pull'
echo 'Use sudo sh Start-Streaming.sh --game-directory /actual/Data/path --pull --no-browser'
echo 'Then open http://localhost:8098/ in your normal user browser.'
