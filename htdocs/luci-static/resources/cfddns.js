'use strict';
'require baseclass';
'require ui';
'require fs';
'require uci';

/* Module dung chung cho cac trang cua luci-app-cloudflare-ddns.
   Dung mau nua trong suot (rgba) + opacity de hoat dong tot tren ca theme sang
   lan theme toi (Argon, Material...), khong phu thuoc bien mau cua theme. */

var CSS = [
	'.cf-toolbar{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0}',
	'.cf-toolbar>.btn{width:auto!important;flex:0 0 auto;margin:0!important;',
	'min-width:auto!important;display:inline-flex;align-items:center;justify-content:center}',

	'.cf-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));',
	'gap:.75rem;margin:0 0 1rem}',
	'.cf-stat{padding:.7rem .9rem;border-radius:10px;background:rgba(128,128,128,.12);',
	'border:1px solid rgba(128,128,128,.22)}',
	'.cf-stat-label{font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;',
	'opacity:.65;margin-bottom:.3rem}',
	'.cf-stat-value{font-size:1.05rem;font-weight:600;line-height:1.35;word-break:break-word}',
	'.cf-stat-note{font-size:.8rem;opacity:.7;margin-top:.25rem;word-break:break-word}',

	'.cf-badge{display:inline-block;padding:.1rem .55rem;border-radius:999px;',
	'font-size:.8rem;font-weight:600;white-space:nowrap;border:1px solid}',

	'.cf-recs{width:100%;border-collapse:collapse;margin-top:.25rem}',
	'.cf-recs th{text-align:left;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;',
	'opacity:.65;font-weight:600;padding:.35rem .6rem;border-bottom:1px solid rgba(128,128,128,.25)}',
	'.cf-recs td{padding:.45rem .6rem;border-bottom:1px solid rgba(128,128,128,.14);',
	'vertical-align:middle;word-break:break-word}',
	'.cf-recs tr:last-child td{border-bottom:0}',
	'.cf-mono{font-family:monospace}',
	'.cf-recs-wrap{overflow-x:auto;padding-bottom:.25rem}',

	'.cf-heading{font-size:.78rem;letter-spacing:.05em;text-transform:uppercase;',
	'opacity:.65;margin:1.25rem 0 .5rem}',

	/* nut trong hop thoai cung bi theme ep full-width, tra lai kich thuoc tu nhien */
	'.modal .cbi-button{width:auto!important;min-width:auto!important;margin-left:.4rem}',
	'.cf-bulk-input{width:100%;font-family:monospace;font-size:.9rem;line-height:1.6;',
	'border-radius:10px;background:rgba(128,128,128,.12);color:inherit;',
	'border:1px solid rgba(128,128,128,.3);padding:.6rem;resize:vertical}',
	'.cf-out{max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-word;',
	'font-family:monospace;font-size:.85rem;line-height:1.5;border-radius:10px;',
	'background:rgba(128,128,128,.12);border:1px solid rgba(128,128,128,.22);padding:.75rem}',
	'.cf-log{width:100%;font-family:monospace;font-size:.85rem;line-height:1.5;',
	'white-space:pre;border-radius:10px;background:rgba(128,128,128,.12);',
	'border:1px solid rgba(128,128,128,.22);padding:.75rem;color:inherit;resize:vertical}',

	'@media (max-width:600px){.cf-toolbar>.btn{flex:1 1 100%}}'
].join('');

/* [nhan, mau] - mau dung cho ca chu, vien va nen mo */
var STATES = {
	ok:      [ 'OK',           '76,175,80'   ],
	updated: [ 'Updated',      '66,153,225'  ],
	error:   [ 'Error',        '229,83,83'   ],
	missing: [ 'No A record',  '230,162,60'  ],
	unknown: [ 'Unknown',      '150,150,150' ]
};

return baseclass.extend({
	CSS: CSS,

	/* cho phep ban ghi wildcard: *.s3.vidu.com */
	HOSTNAME_RE:
		/^(\*\.)?[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/,

	/* the <style> chen kem trang */
	style: function () {
		return E('style', { 'type': 'text/css' }, CSS);
	},

	badge: function (state, label) {
		var m = STATES[state] || STATES.unknown;

		return E('span', {
			'class': 'cf-badge',
			'style': 'color:rgb(' + m[1] + ');background:rgba(' + m[1] + ',.14);' +
			         'border-color:rgba(' + m[1] + ',.45)'
		}, label || _(m[0]));
	},

	/* Chay lenh cloudflare-ddns va hien ket qua trong hop thoai */
	runCommand: function (args, title) {
		ui.showModal(title, [
			E('p', { 'class': 'spinning' }, _('Working, please wait...'))
		]);

		return fs.exec('/usr/bin/cloudflare-ddns', args).then(function (res) {
			var out = ((res.stdout || '') + (res.stderr || '')).trim() || _('No output');

			ui.showModal(title, [
				E('pre', { 'class': 'cf-out' }, out),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'))
				])
			]);
		}).catch(function (err) {
			ui.showModal(title, [
				E('p', {}, _('Command failed: %s').format(err.message || err)),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'))
				])
			]);
		});
	},

	currentDomains: function () {
		return (uci.sections('cloudflare-ddns', 'domain') || []).filter(function (s) {
			return s.name;
		});
	},

	/* Ap dung danh sach nhieu dong vao UCI */
	applyBulkList: function (m, textarea, errBox) {
		var self = this;
		var lines = (textarea.value || '').split(/\r?\n/);
		var names = [], seen = {}, bad = [];

		for (var i = 0; i < lines.length; i++) {
			var n = lines[i].trim().toLowerCase().replace(/\.$/, '');

			if (!n || n.charAt(0) == '#')
				continue;

			if (!self.HOSTNAME_RE.test(n)) {
				bad.push(_('line %d: %s').format(i + 1, lines[i].trim()));
				continue;
			}

			if (seen[n])
				continue;

			seen[n] = true;
			names.push(n);
		}

		if (bad.length) {
			errBox.textContent = _('Invalid hostname — %s').format(bad.join(' / '));
			return;
		}

		errBox.textContent = '';

		/* luu truoc nhung gi dang go do trong form, bo qua loi kiem tra */
		return Promise.resolve(m.save(null, true)).catch(function () {}).then(function () {
			var existing = {}, added = 0, removed = 0;

			self.currentDomains().forEach(function (s) {
				existing[s.name.toLowerCase()] = s['.name'];
			});

			names.forEach(function (n) {
				if (existing[n])
					return;

				var sid = uci.add('cloudflare-ddns', 'domain');
				uci.set('cloudflare-ddns', sid, 'name', n);
				uci.set('cloudflare-ddns', sid, 'enabled', '1');
				uci.set('cloudflare-ddns', sid, 'proxied', 'keep');
				added++;
			});

			Object.keys(existing).forEach(function (n) {
				if (seen[n])
					return;

				uci.remove('cloudflare-ddns', existing[n]);
				removed++;
			});

			if (!added && !removed) {
				ui.hideModal();
				ui.addNotification(null, E('p', _('The list is unchanged.')), 'info');
				return;
			}

			return uci.save().then(function () {
				ui.showModal(_('Bulk edit domains'), [
					E('p', {}, _('Added: %d, removed: %d.').format(added, removed)),
					E('p', {}, [
						_('The list has been staged. Press '),
						E('strong', {}, _('Save & Apply')),
						_(' on the page to activate it.')
					]),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-positive',
							'click': function () { window.location.reload(); }
						}, _('Reload page'))
					])
				]);
			});
		});
	},

	bulkEditDialog: function (m) {
		var self = this;
		var list = self.currentDomains().map(function (s) { return s.name; });

		var textarea = E('textarea', {
			'id': 'cf-bulk-list',
			'class': 'cf-bulk-input',
			'wrap': 'off',
			'rows': 12,
			'placeholder': 'menu.example.com\nmonan.example.com\nsub.example.net'
		}, [ list.join('\n') ]);

		var errBox = E('div', { 'style': 'color:rgb(229,83,83);margin-top:.5em;font-weight:bold' });

		ui.showModal(_('Bulk edit domains'), [
			E('p', {}, _('One hostname per line. Empty lines and lines starting with # are ignored, duplicates are dropped.')),
			E('p', {}, _('New hostnames are added as enabled, with the Cloudflare proxy setting left untouched. Hostnames you delete from this list are removed together with their per-domain settings.')),
			textarea,
			errBox,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': ui.createHandlerFn(self, function () {
						return self.applyBulkList(m, textarea, errBox);
					})
				}, _('Apply list'))
			])
		]);

		textarea.focus();
	}
});
