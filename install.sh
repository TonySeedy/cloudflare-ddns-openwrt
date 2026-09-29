#!/bin/sh
#
# Cai dat truc tiep tren router OpenWrt, khong can build goi.
# Chay TREN ROUTER, trong thu muc chua ma nguon nay:
#
#   sh install.sh
#
# Go bo:
#
#   sh install.sh uninstall
#
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"

say() { echo "==> $*"; }

# BusyBox tren OpenWrt khong co applet 'install', dung cp + chmod
copy() {
	cp -f "$1" "$2" || {
		echo "!!! Khong chep duoc $1 -> $2" >&2
		exit 1
	}
	chmod "$3" "$2"
}

do_uninstall() {
	say "Dung dich vu"
	/etc/init.d/cloudflare-ddns stop 2>/dev/null || true
	/etc/init.d/cloudflare-ddns disable 2>/dev/null || true

	rm -f /usr/bin/cloudflare-ddns
	rm -f /etc/init.d/cloudflare-ddns
	rm -f /usr/share/rpcd/acl.d/luci-app-cloudflare-ddns.json
	rm -f /usr/share/luci/menu.d/luci-app-cloudflare-ddns.json
	rm -f /etc/uci-defaults/40-luci-cloudflare-ddns
	rm -rf /www/luci-static/resources/view/cloudflare-ddns
	rm -f /www/luci-static/resources/cfddns.js
	rm -rf /var/run/cloudflare-ddns
	rm -f /usr/lib/lua/luci/i18n/cloudflare-ddns.*.lmo
	rm -f /var/lock/cloudflare-ddns.lock

	echo "Giu lai /etc/config/cloudflare-ddns va /var/log/cloudflare-ddns.log (xoa tay neu can)."

	/etc/init.d/rpcd reload 2>/dev/null || true
	rm -f /tmp/luci-indexcache* 2>/dev/null || true
	rm -rf /tmp/luci-modulecache 2>/dev/null || true
	say "Da go bo."
}

do_install() {
	# --- kiem tra phu thuoc ---
	if ! command -v curl > /dev/null 2>&1; then
		say "Thieu 'curl', dang cai..."
		if command -v apk > /dev/null 2>&1; then
			apk update && apk add curl ca-bundle
		else
			opkg update && opkg install curl ca-bundle
		fi
	fi

	command -v jsonfilter > /dev/null 2>&1 || {
		echo "!!! Thieu 'jsonfilter' (thuoc goi co ban cua OpenWrt)." >&2
		exit 1
	}

	# --- cai dat file ---
	say "Sao chep file"
	mkdir -p /usr/bin /etc/init.d /etc/config \
		/usr/share/rpcd/acl.d /usr/share/luci/menu.d /etc/uci-defaults \
		/www/luci-static/resources/view/cloudflare-ddns

	copy "$SRC/root/usr/bin/cloudflare-ddns" /usr/bin/cloudflare-ddns 0755
	copy "$SRC/root/etc/init.d/cloudflare-ddns" /etc/init.d/cloudflare-ddns 0755

	# khong ghi de cau hinh dang co
	if [ ! -f /etc/config/cloudflare-ddns ]; then
		copy "$SRC/root/etc/config/cloudflare-ddns" /etc/config/cloudflare-ddns 0600
	else
		say "Giu nguyen /etc/config/cloudflare-ddns dang co"
	fi

	copy "$SRC/root/usr/share/rpcd/acl.d/luci-app-cloudflare-ddns.json" \
		/usr/share/rpcd/acl.d/luci-app-cloudflare-ddns.json 0644
	copy "$SRC/root/usr/share/luci/menu.d/luci-app-cloudflare-ddns.json" \
		/usr/share/luci/menu.d/luci-app-cloudflare-ddns.json 0644
	copy "$SRC/root/etc/uci-defaults/40-luci-cloudflare-ddns" \
		/etc/uci-defaults/40-luci-cloudflare-ddns 0755

	copy "$SRC/htdocs/luci-static/resources/cfddns.js" \
		/www/luci-static/resources/cfddns.js 0644

	for v in settings domains log; do
		copy "$SRC/htdocs/luci-static/resources/view/cloudflare-ddns/$v.js" \
			/www/luci-static/resources/view/cloudflare-ddns/$v.js 0644
	done

	# --- ban dich tieng Viet (neu co po2lmo) ---
	if command -v po2lmo > /dev/null 2>&1 && [ -f "$SRC/po/vi/cloudflare-ddns.po" ]; then
		mkdir -p /usr/lib/lua/luci/i18n
		po2lmo "$SRC/po/vi/cloudflare-ddns.po" /usr/lib/lua/luci/i18n/cloudflare-ddns.vi.lmo
		say "Da cai ban dich tieng Viet"
	else
		say "Bo qua ban dich (khong co po2lmo) - giao dien se hien tieng Anh"
	fi

	# --- kich hoat ---
	sh /etc/uci-defaults/40-luci-cloudflare-ddns

	say "Cai dat xong."
	echo
	echo "Vao LuCI: Services > Cloudflare DDNS, dien API Token va them ten mien,"
	echo "bat 'Enable' roi bam Save & Apply."
}

case "${1:-install}" in
	uninstall | remove) do_uninstall ;;
	install) do_install ;;
	*) echo "Usage: $0 [install|uninstall]" >&2; exit 1 ;;
esac
