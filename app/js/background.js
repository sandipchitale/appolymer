function launch() {
	chrome.app.window.create('appolymer-csp.html', {
		'width' : 340,
		'height' : 360,
		'frame' : 'none'
	});
}
chrome.app.runtime.onLaunched.addListener(function() {
	launch();
});