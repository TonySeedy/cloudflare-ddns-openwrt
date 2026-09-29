# luci-app-cloudflare-ddns

Cập nhật DDNS Cloudflare cho OpenWrt, **có giao diện web trong LuCI**.

Bản này viết lại từ script Python ban đầu thành shell script POSIX (chạy được trên
BusyBox, không cần cài Python lên router) cộng thêm một app LuCI đóng gói dạng
`.apk` (OpenWrt 25.12 / SNAPSHOT) hoặc `.ipk` (OpenWrt 24.10 trở về trước).

## Tính năng

- Giao diện web tại **Services → Cloudflare DDNS** (tiếng Việt + tiếng Anh), chia 3 tab: **Settings / Domains / Log**
- Quản lý nhiều tên miền, mỗi tên miền bật/tắt riêng
- **Nhập danh sách hàng loạt**: dán nhiều tên miền, mỗi dòng một cái, thay vì thêm từng dòng một
- Tự dò zone của tên miền con (`menu.example.com` → zone `example.com`)
- Hỗ trợ bản ghi **wildcard** (`*.s3.example.com`)
- Tuỳ chọn cập nhật kèm bản ghi `www.`
- Giữ nguyên / bật / tắt proxy Cloudflare (mây cam – mây xám) cho từng tên miền
- Lấy IP WAN **ưu tiên đọc từ interface trên router**, chỉ hỏi dịch vụ ngoài khi IP đó là private (router sau NAT)
- Chạy nền bằng procd, tự cập nhật khi interface WAN lên
- Bảng trạng thái tự làm mới, nút **Cập nhật ngay**, **Kiểm tra token**, **Dò IP WAN**
- Trang xem nhật ký trực tiếp, tự xoay vòng log để không đầy flash

## Yêu cầu

| Thành phần | Ghi chú |
|---|---|
| OpenWrt 21.02 trở lên | LuCI bản JS (`luci-base` mới) |
| `curl` + `ca-bundle` | script cài sẽ tự cài nếu thiếu |
| `jsonfilter` | có sẵn trong OpenWrt base |
| Khoảng 40 KB flash | |

Bản ghi A của tên miền **phải tồn tại sẵn** trên Cloudflare (app chỉ sửa, không tạo mới).

---

## Cài đặt

### Cách 1 — Cài bằng gói `.apk` / `.ipk` (khuyên dùng)

Sau khi có file gói (xem [Cách 2](#cách-2--build-gói-từ-mã-nguồn) để tự build), chép
lên router rồi cài. Không dùng `scp` — xem giải thích ở
[Cách 3](#cách-3--nén-gửi-qua-ssh-và-cài-trực-tiếp-không-cần-build).

**1. Chép gói lên router** — thay tên file trong `out/` cho đúng với gói vừa build:

```bash
ssh root@192.168.1.1 "cat > /tmp/cfddns.pkg" < out/luci-app-cloudflare-ddns_1.0.0-r1_all.apk
```

**2. Cài trên router**

OpenWrt 25.12 / SNAPSHOT (gói `.apk`):

```bash
ssh root@192.168.1.1 "apk add --allow-untrusted /tmp/cfddns.pkg"
```

OpenWrt 24.10 trở về trước (gói `.ipk`):

```bash
ssh root@192.168.1.1 "opkg update && opkg install /tmp/cfddns.pkg"
```

> `--allow-untrusted` là bắt buộc vì gói tự build không được ký bằng khoá của OpenWrt.

Cài xong vào LuCI, nếu chưa thấy menu thì Ctrl+F5 để xoá cache trình duyệt.

### Cách 2 — Build gói từ mã nguồn

Cần một máy Linux (hoặc WSL trên Windows) với `build-essential`, `git`, `python3`,
`curl`, `zstd`, `unzip`.

1. Tìm SDK đúng với router của anh tại <https://downloads.openwrt.org>:
   `releases/<phiên bản>/targets/<target>/<subtarget>/` — file tên
   `openwrt-sdk-*.Linux-x86_64.tar.zst` (SNAPSHOT) hoặc `.tar.xz` (bản cũ).

   Ví dụ cho router MT7621 chạy SNAPSHOT:

   ```
   https://downloads.openwrt.org/snapshots/targets/ramips/mt7621/openwrt-sdk-ramips-mt7621_gcc-13.3.0_musl.Linux-x86_64.tar.zst
   ```

2. Build:

   ```bash
   chmod +x build.sh
   SDK_URL="https://downloads.openwrt.org/snapshots/targets/ramips/mt7621/openwrt-sdk-....tar.zst" ./build.sh
   ```

   Hoặc nếu đã giải nén SDK sẵn:

   ```bash
   SDK_DIR=/home/user/openwrt-sdk-ramips-mt7621 ./build.sh
   ```

3. Gói thành phẩm nằm trong thư mục `out/`. Định dạng (`.apk` hay `.ipk`) do
   phiên bản SDK quyết định — SDK 25.12/SNAPSHOT ra `.apk`, SDK 24.10 ra `.ipk`.

Vì đây là gói `PKGARCH:=all` (chỉ có script + JS, không có mã biên dịch), gói build
bằng SDK của target nào cũng cài được sang target khác cùng phiên bản OpenWrt.

### Cách 3 — Nén, gửi qua SSH và cài trực tiếp (không cần build)

Nhanh nhất khi chỉ dùng cho một router. Toàn bộ mã nguồn chỉ khoảng 70 KB.

> **Đừng dùng `scp`.** OpenSSH từ bản 9.0 cho `scp` chạy nền giao thức SFTP, trong
> khi OpenWrt mặc định dùng Dropbear và không cài `sftp-server`, nên sẽ báo lỗi:
>
> ```
> ash: /usr/libexec/sftp-server: not found
> scp: Connection closed
> ```
>
> Cờ `scp -O` cũng không cứu được vì cách đó cần binary `scp` nằm trên router,
> OpenWrt base cũng không có. Dùng `tar` qua `ssh` như bên dưới là sạch nhất,
> không phải cài thêm gói nào lên router.

#### Trên Windows (cmd.exe)

Windows 10/11 có sẵn `tar` và `ssh`, không cần cài PuTTY hay WinSCP.
Chạy trong **`cmd`**, không dùng PowerShell (PowerShell 5.1 không hỗ trợ toán tử
chuyển hướng `<` và sẽ làm hỏng dữ liệu nhị phân khi truyền qua pipe).

**1. Nén mã nguồn** — đổi `G:\Project Test` thành thư mục chứa mã nguồn của anh:

```bash
tar -cf "%TEMP%\cfddns.tar" --exclude .git -C "G:\Project Test" cloudflare-ddns-openwrt
```

**2. Gửi lên router và giải nén thẳng vào `/tmp`** — đổi `192.168.1.1` thành IP router:

```bash
ssh root@192.168.1.1 "tar -xf - -C /tmp" < "%TEMP%\cfddns.tar"
```

Nhập mật khẩu root. Không hiện thông báo gì nghĩa là thành công.

**3. Cài đặt:**

```bash
ssh root@192.168.1.1 "sh /tmp/cloudflare-ddns-openwrt/install.sh"
```

#### Trên Linux / macOS

Gộp cả ba bước thành một lệnh:

```bash
tar -cf - --exclude .git -C .. cloudflare-ddns-openwrt | ssh root@192.168.1.1 "tar -xf - -C /tmp && sh /tmp/cloudflare-ddns-openwrt/install.sh"
```

#### Sau khi cài

Mở `http://192.168.1.1` → **Services → Cloudflare DDNS**. Chưa thấy menu thì Ctrl+F5.

Kiểm tra nhanh bằng dòng lệnh sau khi đã điền token và tên miền:

```bash
ssh root@192.168.1.1 "cloudflare-ddns zones && cloudflare-ddns check && cloudflare-ddns force"
```

Lần lượt: liệt kê zone (xác nhận token đúng quyền) → in IP WAN dò được → ép cập nhật ngay.

#### Cập nhật lại sau khi sửa mã nguồn

Lặp lại bước 1 và 2, rồi chạy lại `install.sh` — script tự ghi đè file cũ và
**giữ nguyên** `/etc/config/cloudflare-ddns` nên anh không mất token và danh sách tên miền.

#### Lưu ý

Cách này chép thẳng file vào hệ thống, **sysupgrade sẽ mất app** (chỉ
`/etc/config/cloudflare-ddns` được giữ nếu nằm trong danh sách sao lưu). Nếu anh
hay nâng cấp firmware thì nên dùng gói ở [Cách 1](#cách-1--cài-bằng-gói-apk--ipk-khuyên-dùng).

Giao diện sẽ hiện **tiếng Anh** khi cài kiểu này, vì router thường không có sẵn
`po2lmo` để biên dịch file dịch. Cài bằng gói `.apk`/`.ipk` thì có tiếng Việt đầy đủ.

#### Nếu vẫn muốn dùng `scp` cho những lần sau

Cài `sftp-server` lên router một lần (lệnh tự nhận biết `apk` hay `opkg`):

```bash
ssh root@192.168.1.1 "apk add openssh-sftp-server || { opkg update && opkg install openssh-sftp-server; }"
```

---

## Lấy API Token của Cloudflare

1. Đăng nhập <https://dash.cloudflare.com> → góc phải trên → **My Profile**
2. Tab **API Tokens** → **Create Token** → chọn template **Edit zone DNS**
3. Mục *Zone Resources*: chọn **Include → All zones** (hoặc chọn đúng các zone cần dùng)
4. **Continue to summary** → **Create Token** → copy token (chỉ hiện đúng một lần)

Token cần tối thiểu quyền **Zone → DNS → Edit**. Nếu muốn nút *Kiểm tra token /
liệt kê zone* hoạt động đầy đủ thì thêm **Zone → Zone → Read**.

> Đừng dùng Global API Key — token phạm vi hẹp an toàn hơn nhiều.

---

## Sử dụng

Vào **LuCI → Services → Cloudflare DDNS**:

1. **Cài đặt chung**
   - *API Token*: dán token vừa tạo
   - *Chu kỳ kiểm tra*: mặc định 300 giây
   - *Nguồn lấy IP WAN*: để mặc định **Tự động** — đọc IP trên interface `wan` trước,
     nếu đó là IP private (router nằm sau modem NAT) thì mới hỏi dịch vụ ngoài.
     Muốn ép hẳn một hướng thì chọn *Chỉ lấy từ interface* hoặc *Chỉ lấy từ dịch vụ ngoài*
   - Bật **Enable**

2. Sang tab **Domains** → **Thêm tên miền**
   - *Tên miền*: `menu.example.com`
   - *Proxy Cloudflare*: `Giữ nguyên như hiện tại` (an toàn nhất)
   - *Cập nhật thêm www.*: bật nếu cần cập nhật cả `www.<tên miền>`

   Có nhiều tên miền thì bấm **Nhập danh sách tên miền** ở đầu tab Domains,
   dán vào mỗi dòng một tên miền:

   ```
   menu.example.com
   sub.example.net
   # dong bat dau bang # bi bo qua
   shop.example.net
   ```

   Danh sách này là **ảnh chụp trạng thái cuối cùng**: tên miền mới sẽ được thêm
   (mặc định bật, giữ nguyên thiết lập proxy), tên miền anh xoá khỏi ô nhập sẽ bị
   gỡ kèm tuỳ chỉnh riêng của nó. Tên miền đã có mà vẫn giữ trong danh sách thì
   không bị đụng tới. Dòng trống bị bỏ qua, tên miền trùng chỉ giữ một.
   Bấm **Áp dụng danh sách** → **Tải lại trang** → **Save & Apply**.

3. Bấm **Save & Apply**, rồi bấm **Cập nhật ngay** để chạy thử.

Bảng trạng thái phía trên hiện IP hiện tại, thời điểm kiểm tra gần nhất và kết quả
từng bản ghi. Chi tiết lỗi xem ở tab **Nhật ký**.

### Dùng bằng dòng lệnh

```bash
cloudflare-ddns update    # cập nhật (bỏ qua nếu IP không đổi)
cloudflare-ddns force     # ép cập nhật ngay cả khi IP không đổi
cloudflare-ddns check     # in ra IP WAN dò được
cloudflare-ddns zones     # liệt kê zone trong tài khoản (kiểm tra token)
cloudflare-ddns status    # in trạng thái lần chạy gần nhất (JSON)

/etc/init.d/cloudflare-ddns start|stop|restart|update
```

---

## Cấu hình UCI

File `/etc/config/cloudflare-ddns`:

```
config settings 'settings'
	option enabled '1'
	option api_token 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
	option interval '300'
	option ip_source 'auto'         # auto | interface | url
	option ip_url 'https://api.ipify.org'
	option ip_interface 'wan'
	option ttl '120'
	option force_update '0'
	option verbose '0'
	option log_file '/var/log/cloudflare-ddns.log'
	option log_size '64'

config domain
	option name 'menu.example.com'
	option enabled '1'
	option proxied 'keep'           # keep | 1 | 0
	option include_www '0'

config domain
	option name 'sub.example.net'
	option enabled '1'
	option proxied 'keep'
	option include_www '0'
```

Thêm nhanh bằng lệnh:

```bash
uci add cloudflare-ddns domain
uci set cloudflare-ddns.@domain[-1].name='sub.example.net'
uci set cloudflare-ddns.@domain[-1].enabled='1'
uci set cloudflare-ddns.@domain[-1].proxied='keep'
uci commit cloudflare-ddns
/etc/init.d/cloudflare-ddns restart
```

---

## Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Không thấy menu trong LuCI | `/etc/init.d/rpcd reload; rm -f /tmp/luci-indexcache*` rồi Ctrl+F5 |
| `khong tim thay zone` | Token không có quyền trên zone đó, hoặc domain chưa được thêm vào Cloudflare |
| `chua co ban ghi A` | Vào Cloudflare tạo bản ghi A cho tên miền đó trước (giá trị IP gì cũng được) |
| Wildcard không cập nhật | Bản ghi `*.x.com` phải là **DNS only** (mây xám) — Cloudflare chỉ cho proxy wildcard ở gói Enterprise |
| `khong lay duoc IP WAN` | Router chưa ra được Internet, thiếu `ca-bundle`, hoặc đổi sang URL dò IP khác |
| Lỗi SSL khi gọi API | `apk add ca-bundle` (hoặc `opkg install ca-bundle`) và chỉnh đúng giờ hệ thống |
| IP đã đổi nhưng DNS chưa đổi | Bật *Luôn gửi cập nhật*, hoặc bấm **Cập nhật ngay** |
| Nút bấm báo lỗi quyền | `/etc/init.d/rpcd restart` để nạp lại file ACL |

Bật *Ghi nhật ký chi tiết* trong giao diện để xem log đầy đủ ở tab **Nhật ký**.

---

## Gỡ cài đặt

Nếu cài bằng gói:

```bash
apk del luci-app-cloudflare-ddns        # OpenWrt 25.12 / SNAPSHOT
opkg remove luci-app-cloudflare-ddns    # OpenWrt 24.10 trở về trước
```

Nếu cài bằng `install.sh`:

```bash
sh /tmp/cloudflare-ddns-openwrt/install.sh uninstall
```

Cả hai cách đều giữ lại `/etc/config/cloudflare-ddns`; xoá tay nếu muốn sạch hẳn.

---

## Cấu trúc mã nguồn

```
.
├── Makefile                                    # Makefile gói OpenWrt (dùng luci.mk)
├── build.sh                                    # build .apk/.ipk bằng SDK
├── install.sh                                  # cài trực tiếp lên router
├── htdocs/luci-static/
│   └── resources/
│       ├── cfddns.js                           # module dùng chung: CSS, badge, hộp thoại
│       └── view/cloudflare-ddns/
│           ├── settings.js                     # tab trạng thái + cài đặt chung
│           ├── domains.js                      # tab danh sách tên miền
│           └── log.js                          # tab nhật ký
├── po/vi/cloudflare-ddns.po                    # bản dịch tiếng Việt
└── root/
    ├── etc/config/cloudflare-ddns              # cấu hình UCI mặc định
    ├── etc/init.d/cloudflare-ddns              # dịch vụ procd
    ├── etc/uci-defaults/40-luci-cloudflare-ddns
    └── usr/
        ├── bin/cloudflare-ddns                 # script cập nhật DNS
        └── share/
            ├── luci/menu.d/...json             # mục menu LuCI
            └── rpcd/acl.d/...json              # quyền truy cập LuCI
```

## Giấy phép

MIT
