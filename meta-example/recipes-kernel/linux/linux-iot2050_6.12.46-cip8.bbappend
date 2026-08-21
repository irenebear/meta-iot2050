# 内核源码换源：cdn.kernel.org 在 GitHub runner 上不可达（wget exit 4）
# → 改用 GitLab CIP 官方仓库的 release tarball
SRC_URI:remove = "https://cdn.kernel.org/pub/linux/kernel/projects/cip/6.12/linux-cip-${PV}.tar.xz"
SRC_URI:append = " https://gitlab.com/cip-project/cip-kernel/linux-cip/-/archive/v${PV}/linux-cip-v${PV}.tar.gz"

# GitLab archive 解压目录名是 linux-cip-v6.12.46-cip8（带 v），覆盖 S 匹配
S = "${WORKDIR}/linux-cip-v${PV}"
