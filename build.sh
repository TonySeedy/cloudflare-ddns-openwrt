#!/usr/bin/env bash
#
# Build luci-app-cloudflare-ddns thanh goi .apk (OpenWrt >= 25.12 / SNAPSHOT)
# hoac .ipk (OpenWrt <= 24.10) bang OpenWrt SDK.
#
# Cach dung:
#   1) Da co SDK giai nen san:
#        SDK_DIR=/path/to/openwrt-sdk-... ./build.sh
#   2) De script tu tai SDK ve:
#        SDK_URL=https://downloads.openwrt.org/.../openwrt-sdk-....tar.zst ./build.sh
#
# Goi thanh pham nam trong thu muc ./out
#
set -euo pipefail

PKG_NAME="luci-app-cloudflare-ddns"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SRC_DIR/out"
WORK_DIR="${WORK_DIR:-$SRC_DIR/.build}"

msg() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m!!!\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Chuan bi SDK ---------------------------------------------------------
if [ -n "${SDK_DIR:-}" ]; then
	[ -f "$SDK_DIR/rules.mk" ] || die "SDK_DIR khong hop le (thieu rules.mk): $SDK_DIR"
elif [ -n "${SDK_URL:-}" ]; then
	mkdir -p "$WORK_DIR"
	ARCHIVE="$WORK_DIR/$(basename "$SDK_URL")"
	if [ ! -f "$ARCHIVE" ]; then
		msg "Tai SDK: $SDK_URL"
		curl -fL --progress-bar -o "$ARCHIVE" "$SDK_URL"
	fi
	msg "Giai nen SDK"
	case "$ARCHIVE" in
		*.tar.zst) command -v zstd >/dev/null || die "Can cai 'zstd' de giai nen"
		           tar --use-compress-program=unzstd -xf "$ARCHIVE" -C "$WORK_DIR" ;;
		*.tar.xz)  tar -xJf "$ARCHIVE" -C "$WORK_DIR" ;;
		*)         die "Dinh dang SDK khong ho tro: $ARCHIVE" ;;
	esac
	SDK_DIR="$(find "$WORK_DIR" -maxdepth 1 -type d -name 'openwrt-sdk-*' | head -n1)"
	[ -n "$SDK_DIR" ] || die "Khong tim thay thu muc SDK sau khi giai nen"
else
	die "Hay dat SDK_DIR hoac SDK_URL. Xem README.md muc 'Build tu ma nguon'."
fi

msg "SDK: $SDK_DIR"

# --- 2. Feeds ----------------------------------------------------------------
cd "$SDK_DIR"

if ! grep -q '^src-git.*luci' feeds.conf.default feeds.conf 2>/dev/null; then
	die "SDK khong co feed luci"
fi

msg "Cap nhat feed luci (co the mat vai phut)"
./scripts/feeds update -a >/dev/null
./scripts/feeds install -a >/dev/null

# --- 3. Nhung package vao SDK ------------------------------------------------
mkdir -p "$SDK_DIR/package/$PKG_NAME"
rm -rf "$SDK_DIR/package/$PKG_NAME"
cp -a "$SRC_DIR" "$SDK_DIR/package/$PKG_NAME"
rm -rf "$SDK_DIR/package/$PKG_NAME/.build" "$SDK_DIR/package/$PKG_NAME/out"

# --- 4. Build ----------------------------------------------------------------
msg "Bat dau build $PKG_NAME"
make defconfig >/dev/null
make "package/$PKG_NAME/compile" V=s "-j$(nproc)"

# --- 5. Thu hoach goi --------------------------------------------------------
mkdir -p "$OUT_DIR"
found=0
while IFS= read -r f; do
	cp -f "$f" "$OUT_DIR/"
	msg "Goi: $OUT_DIR/$(basename "$f")"
	found=1
done < <(find "$SDK_DIR/bin" -name "${PKG_NAME}*.apk" -o -name "${PKG_NAME}*.ipk" 2>/dev/null)

[ "$found" = "1" ] || die "Build xong nhung khong tim thay goi trong $SDK_DIR/bin"

msg "Hoan tat."
