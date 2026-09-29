'use strict';
'require view';
'require fs';
'require ui';
'require poll';
'require cfddns as cf';

var LOGFILE = '/var/log/cloudflare-ddns.log';


function readLog() {
	return fs.read_direct(LOGFILE).then(function (data) {
		return (data || '').trim();
	}).catch(function () {
		return null;
	});
}

return view.extend({
	load: function () {
		return readLog();
	},

	render: function (content) {
		var area = E('textarea', {
			'id': 'cf-ddns-log',
			'class': 'cf-log',
			'readonly': 'readonly',
			'wrap': 'off',
			'rows': 25
		}, [ content || _('Log file is empty or has not been created yet.') ]);

		function refresh() {
			return readLog().then(function (data) {
				var node = document.getElementById('cf-ddns-log');
				if (!node)
					return;
				var atBottom = (node.scrollTop + node.clientHeight + 20 >= node.scrollHeight);
				node.value = data || _('Log file is empty or has not been created yet.');
				if (atBottom)
					node.scrollTop = node.scrollHeight;
			});
		}

		poll.add(refresh, 5);

		var actions = E('div', { 'class': 'cf-toolbar' }, [
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(this, refresh)
			}, _('Refresh')),
			E('button', {
				'class': 'btn cbi-button cbi-button-reset',
				'click': ui.createHandlerFn(this, function () {
					return fs.write(LOGFILE, '').then(function () {
						ui.addNotification(null, E('p', _('Log cleared')), 'info');
						return refresh();
					}).catch(function (e) {
						ui.addNotification(null, E('p', _('Cannot clear log: %s').format(e.message || e)));
					});
				})
			}, _('Clear log'))
		]);

		var node = E([], [
			cf.style(),
			E('h2', {}, _('Cloudflare DDNS - Log')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Live view of %s, refreshed every 5 seconds.').format(LOGFILE)),
			actions,
			E('div', { 'class': 'cbi-section' }, [ area ])
		]);

		window.setTimeout(function () {
			var n = document.getElementById('cf-ddns-log');
			if (n)
				n.scrollTop = n.scrollHeight;
		}, 100);

		return node;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
