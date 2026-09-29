'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require cfddns as cf';

return view.extend({
	load: function () {
		return uci.load('cloudflare-ddns');
	},

	render: function () {
		var m, s, o;

		m = new form.Map('cloudflare-ddns', _('Domains'),
			_('The A record must already exist in Cloudflare. Sub-domains are matched to their zone automatically.'));

		s = m.section(form.GridSection, 'domain');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.addbtntitle = _('Add domain');
		s.nodescriptions = true;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'name', _('Hostname'),
			_('For example example.com or menu.example.com'));
		o.rmempty = false;
		o.placeholder = 'sub.example.com';
		o.validate = function (section_id, value) {
			if (!value)
				return _('Hostname is required');
			if (!cf.HOSTNAME_RE.test(value))
				return _('Invalid hostname');
			return true;
		};

		o = s.option(form.ListValue, 'proxied', _('Cloudflare proxy'));
		o.value('keep', _('Keep current setting'));
		o.value('1', _('Proxied (orange cloud)'));
		o.value('0', _('DNS only (grey cloud)'));
		o.default = 'keep';

		o = s.option(form.Flag, 'include_www', _('Also update www.'),
			_('Additionally update the www prefix of this hostname.'));
		o.default = '0';

		o = s.option(form.Value, 'ttl', _('TTL'), _('Leave empty to use the default TTL.'));
		o.datatype = 'or(range(60,86400),"1")';
		o.placeholder = _('default');
		o.modalonly = true;

		return m.render().then(function (mapNode) {
			var toolbar = E('div', { 'class': 'cf-toolbar' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, function () {
						cf.bulkEditDialog(m);
					})
				}, _('Bulk edit domains')),
				E('button', {
					'class': 'btn cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, function () {
						return cf.runCommand([ 'force' ], _('Updating DNS records'));
					})
				}, _('Update now'))
			]);

			return E([], [ cf.style(), toolbar, mapNode ]);
		});
	}
});
