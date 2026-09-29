'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require rpc';
'require poll';
'require uci';
'require cfddns as cf';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function serviceRunning() {
	return callServiceList('cloudflare-ddns').then(function (res) {
		try {
			return Object.values(res['cloudflare-ddns'].instances)[0].running === true;
		}
		catch (e) {
			return false;
		}
	}).catch(function () {
		return false;
	});
}

function readStatus() {
	return fs.exec('/usr/bin/cloudflare-ddns', [ 'status' ]).then(function (res) {
		try {
			return JSON.parse((res.stdout || '').trim());
		}
		catch (e) {
			return { state: 'unknown' };
		}
	}).catch(function () {
		return { state: 'unknown' };
	});
}

function statTile(label, valueNode, note) {
	var children = [
		E('div', { 'class': 'cf-stat-label' }, label),
		E('div', { 'class': 'cf-stat-value' }, valueNode)
	];

	if (note)
		children.push(E('div', { 'class': 'cf-stat-note' }, note));

	return E('div', { 'class': 'cf-stat' }, children);
}

function renderStatus(running, st) {
	var children = [
		E('div', { 'class': 'cf-stats' }, [
			statTile(_('Service'),
				running ? cf.badge('ok', _('Running')) : cf.badge('error', _('Stopped'))),
			statTile(_('Current WAN IP'),
				E('span', { 'class': 'cf-mono' }, st.ip || '—')),
			statTile(_('Last check'), st.time || _('never')),
			statTile(_('Result'), cf.badge(st.state || 'unknown'), st.message || null)
		])
	];

	if (Array.isArray(st.records) && st.records.length) {
		var rows = st.records.map(function (r) {
			return E('tr', {}, [
				E('td', { 'class': 'cf-mono' }, r.name),
				E('td', { 'class': 'cf-mono' }, r.ip || '—'),
				E('td', {}, cf.badge(r.state)),
				E('td', {}, r.message || '')
			]);
		});

		children.push(E('div', { 'class': 'cf-heading' }, _('Records')));
		children.push(E('div', { 'class': 'cf-recs-wrap' }, [
			E('table', { 'class': 'cf-recs' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Hostname')),
					E('th', {}, _('IP')),
					E('th', {}, _('State')),
					E('th', {}, _('Detail'))
				])),
				E('tbody', {}, rows)
			])
		]));
	}

	return E('div', {}, children);
}

return view.extend({
	load: function () {
		return Promise.all([
			serviceRunning(),
			readStatus(),
			uci.load('network')
		]);
	},

	render: function (data) {
		var m, s, o;
		var statusBox = E('div', { 'id': 'cf-ddns-status' }, renderStatus(data[0], data[1]));

		poll.add(function () {
			return Promise.all([ serviceRunning(), readStatus() ]).then(function (d) {
				var node = document.getElementById('cf-ddns-status');
				if (node)
					node.parentNode.replaceChild(
						E('div', { 'id': 'cf-ddns-status' }, renderStatus(d[0], d[1])), node);
			});
		}, 10);

		m = new form.Map('cloudflare-ddns', _('Cloudflare DDNS'),
			_('Automatically keep Cloudflare A records pointed at this router\'s current WAN IP address.'));

		/* ---------- Status + thanh thao tac ---------- */
		s = m.section(form.NamedSection, 'settings', 'settings', _('Status'));
		s.anonymous = true;

		var toolbar = E('div', { 'class': 'cf-toolbar' }, [
			E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(this, function () {
					return cf.runCommand([ 'force' ], _('Updating DNS records'));
				})
			}, _('Update now')),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(this, function () {
					return cf.runCommand([ 'zones' ], _('Zones on this account'));
				})
			}, _('Test token / list zones')),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(this, function () {
					return cf.runCommand([ 'check' ], _('Detected WAN IP'));
				})
			}, _('Detect WAN IP')),
			E('button', {
				'class': 'btn cbi-button cbi-button-neutral',
				'click': ui.createHandlerFn(this, function () {
					return fs.exec('/etc/init.d/cloudflare-ddns', [ 'restart' ]).then(function () {
						ui.addNotification(null, E('p', _('Service restarted')), 'info');
					});
				})
			}, _('Restart service'))
		]);

		o = s.option(form.DummyValue, '_status');
		o.rawhtml = false;
		o.render = function () {
			return E('div', {}, [ statusBox, toolbar ]);
		};

		/* ---------- Cai dat chung ---------- */
		s = m.section(form.NamedSection, 'settings', 'settings', _('General settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Start the update service automatically at boot.'));
		o.rmempty = false;

		o = s.option(form.Value, 'api_token', _('Cloudflare API Token'),
			_('Create at <em>My Profile &gt; API Tokens</em> with permission <em>Zone &gt; DNS &gt; Edit</em>.'));
		o.password = true;
		o.rmempty = false;
		o.validate = function (section_id, value) {
			if (!value || value.length < 20)
				return _('Token looks too short');
			return true;
		};

		o = s.option(form.Value, 'interval', _('Check interval (seconds)'),
			_('How often to check for a WAN IP change. Minimum 60.'));
		o.datatype = 'min(60)';
		o.default = '300';
		o.rmempty = false;

		o = s.option(form.ListValue, 'ip_source', _('WAN IP source'),
			_('Automatic reads the IP from the router first and only queries the external service when that address is private (router behind NAT).'));
		o.value('auto', _('Automatic: router interface first, external service as fallback'));
		o.value('interface', _('Router interface only'));
		o.value('url', _('External service only'));
		o.default = 'auto';

		o = s.option(form.Value, 'ip_url', _('IP detection URL'),
			_('Used as the fallback in automatic mode.'));
		o.depends('ip_source', 'auto');
		o.depends('ip_source', 'url');
		o.value('https://api.ipify.org');
		o.value('https://ifconfig.me/ip');
		o.value('https://icanhazip.com');
		o.value('https://checkip.amazonaws.com');
		o.default = 'https://api.ipify.org';

		o = s.option(form.Value, 'ip_interface', _('Network interface'),
			_('The interface the WAN IP is read from, usually wan.'));
		o.depends('ip_source', 'auto');
		o.depends('ip_source', 'interface');
		o.default = 'wan';
		(uci.sections('network', 'interface') || []).forEach(function (sec) {
			if (sec['.name'] != 'loopback')
				o.value(sec['.name']);
		});

		o = s.option(form.Value, 'ttl', _('Default TTL'),
			_('1 = automatic. Ignored when a record is proxied.'));
		o.datatype = 'or(range(60,86400),"1")';
		o.default = '120';

		o = s.option(form.Flag, 'force_update', _('Always push update'),
			_('Send the update every cycle even when the WAN IP has not changed.'));
		o.default = '0';

		o = s.option(form.Flag, 'verbose', _('Verbose logging'));
		o.default = '0';

		o = s.option(form.Value, 'log_size', _('Max log size (KB)'));
		o.datatype = 'range(8,1024)';
		o.default = '64';

		return m.render().then(function (mapNode) {
			return E([], [ cf.style(), mapNode ]);
		});
	}
});
