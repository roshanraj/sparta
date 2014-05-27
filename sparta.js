/*!
 * sparta.js 0.0.1
 * (c) 2014 Blendle <rick@blendle.nl>
 * sparta may be freely distributed under the MIT license.
 */
module.exports = (function (require) {
	'use strict';

	var _ = require('underscore');
	var Q = require('q');

	var globalSpartaOptions = {};

	function Sparta (options) {
		/**
		 * This function can be called to abort the XHR request
		 */
		var abort = function() {
			this.abort();
		};

		return (function(options) {
			// Set up deferred
			var deferred = sparta.deferred && sparta.deferred();
			var req = new XMLHttpRequest();

			// Set up defaults
			if (globalSpartaOptions) {
				_.defaults(options || (options = {}), globalSpartaOptions);
			}

			// Invoke beforesend
			if (options.beforeSend) {
				options.beforeSend(req, options);
			}

			// Open request
			req.open(options.type || 'GET', options.url, options.async || true);

			// Set up content type
			if (options.contentType) {
				if (!options.headers) options.headers = {};
				options.headers['Content-Type'] = options.contentType;
			}

			if (!options.successStatusCodes) {
				options.successStatusCodes = [200, 201, 202, 204, 304];
			}

			// Stringify GET query params.
			if (options.type === 'GET' && typeof options.data === 'object') {
				var query = '';
				var stringifyKeyValuePair = function(key, value) {
					return value === null ? '' :
						'&' + encodeURIComponent(key) +
						'=' + encodeURIComponent(value);
				};

				for (var key in options.data) {
					query += stringifyKeyValuePair(key, options.data[key]);
				}

				if (query) {
					var sep = (options.url.indexOf('?') === -1) ? '?' : '&';
					options.url += sep + query.substring(1);
				}
			}

			// Are we sending credentials?
			if (options.credentials) {
				options.withCredentials = true;
			}

			// Set request headers
			Object.keys(options.headers || {}).forEach(function (key) {
				req.setRequestHeader(key, options.headers[key]);
			});

			// Listen to state changes
			req.onreadystatechange = function() {
				if (this.readyState !== 4 || this.status === 0) {
					return;
				}

				var data = null;
				var xmlResponseType = /^(?:application|text)\/xml/;
				var jsonResponseType = /^application\/json/;

				if (this.response && this.response !== '') {
					var contentType = this.getResponseHeader('content-type');
					// TODO For now we parse anything that isn't supposed to be xml as JSON. The backend
					// gives us wrong contentType headers sometimes. This "fixes" that, though probably will
					// throw some json parse errors.
					if (!xmlResponseType.test(contentType)) {
						try {
							data = JSON.parse(this.response);
						} catch(err) {
							window.ErrorLogger.captureMessage(
								'JSON Parse Error on server data: ' + this.response,
								{
									tags: {
										type: options.type
									},
									extra: {
										serverUrl: options.url,
										statusCode: options.status
									}
								}
							);
						}
					}
					else if (xmlResponseType.test(contentType)) {
						data = this.responseXML;
					} else {
						data = this.responseText;
					}
				}

				if (options.successStatusCodes.indexOf(this.status) === -1) {
					deferred.reject({
						data: data,
						statusCode: this.status
					});
				} else {
					deferred.resolve({
						data: data,
						statusCode: this.status
					});
				}

				// Remove listeners
				this.onreadystatechange = null;
				this.onabort = null;
				this.onerror = null;
			};

			// Listen to abort changes
			req.onabort = function() {
				deferred.resolve({
					data: null,
					statusCode: 0
				});

				// Remove listeners
				this.onreadystatechange = null;
				this.onabort = null;
				this.onerror = null;
			};

			// Listen to errors
			req.onerror = function() {
				deferred.reject({
					data: null,
					statusCode: -1
				});

				// Remove listeners
				this.onreadystatechange = null;
				this.onabort = null;
				this.onerror = null;
			};

			req.send(options.data || void 0);

			var extendedPromise = _.extend(deferred.promise, {
				abort: abort.bind(req)
			});

			return extendedPromise;
		})(options);
	}

	function sparta (options) {
		return new Sparta(options);
	}

	sparta.ajaxDefaults = function (options) {
		options = options || {}
		for (var k in options) {
			globalSpartaOptions[k] = options[k]
		}
	};

	sparta.deferred = function () {
		return Q.defer();
	};

	return sparta;
})(require);