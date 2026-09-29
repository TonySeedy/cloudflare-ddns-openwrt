#
# Copyright (C) 2025
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cloudflare-ddns
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Huy <39099268+TonySeedy@users.noreply.github.com>
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Cloudflare DDNS
LUCI_DESCRIPTION:=Web interface to keep Cloudflare A records updated with the router WAN IP.
LUCI_DEPENDS:=+luci-base +curl +ca-bundle +libustream-mbedtls
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/conffiles
/etc/config/cloudflare-ddns
endef

# call BuildPackage - OpenWrt buildroot signature
