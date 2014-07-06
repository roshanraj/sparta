/*!
 * sparta.js 0.0.5
 * (c) 2014 Blendle <rick@blendle.nl>
 * sparta may be freely distributed under the MIT license.
 */
 (function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['underscore', 'q'], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require('underscore'), require('q'));
    } else {
        // Browser globals (root is window)
        root.returnExports = factory(root._, root.Q);
    }
}(this, function (_, Q) {
    'use strict';

	var globalSpartaOptions = {};

	var uniqid = 0,
		jsonpLastValue = null,
		jsonpCallbackPrefix = 'sparta_' + (+new Date()),
		head = document.getElementsByTagName('head')[0];

	function Sparta (options) {
		var jsonpLoaded = 0;

		/**
		 * This function can be called to abort the XHR request
		 */
		var abortXHR = function () {
			this.abort();
		};

		/**
		 * abort a JSONP request
		 */
		var abortJSONP = function (script) {
			script.onload = script.onreadystatechange = null;
			head.removeChild(script);

			jsonpLastValue = null;
			jsonpLoaded = 1; // Act like we already did.
		};

		/**
		 * Store JSONP return data
		 */
		var jsonpCallback = function (data) {
			jsonpLastValue = data;
		};


		var jsonp = function (options, deferred) {
			var requestId = uniqid++,
				url = options.url,
				cbKey = options.jsonpCallback || 'callback',
				cbVal = options.jsonpCallbackName || jsonpCallbackPrefix + requestId,
				cbRegExp = new RegExp('((^|\\?|&)' + cbKey + ')=([^&]+)'),
				cbMatch = url.match(cbRegExp),
				script = document.createElement('script');


			// Determine callback
			if (cbMatch) {
				if (cbMatch[3] === '?') {
					url = url.replace(cbRegExp, '$1=' + cbVal); // wildcard callback func name
				} else {
					cbVal = cbMatch[3]; // provided callback func name
				}
			} else {
				// no callback details, add 'em
				url = url + (/\?/.test(url) ? '&' : '?') + (cbKey + '=' + cbVal);
			}

			// make callback available
			window[cbVal] = jsonpCallback;

			// setup script tag and it's readystate
			script.type = 'text/javascript';
			script.src = url;
			script.async = options.async !== undefined ? options.async : true;
			script.onload = script.onreadystatechange = function () {
				if ((script.readyState && script.readyState !== 'complete' && script.readyState !== 'loaded') || jsonpLoaded) {
					return false;
				}

				script.onload = script.onreadystatechange = null;

				// Resolve promise with data
				deferred.resolve(jsonpLastValue);

				jsonpLastValue = null;
				head.removeChild(script);
				jsonpLoaded = 1;
			};

			// Add the script to the DOM head
			head.appendChild(script);

			// make promise abortable
			var extendedPromise = _.extend(deferred.promise, {
				abort: abortJSONP.bind(this, script)
			});

			return extendedPromise;
		};


		return function(options) {
			// Set up deferred
			var deferred = sparta.deferred && sparta.deferred();

			// handle jsonp
			if (options.jsonp) {
				return jsonp(options, deferred);
			}

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
			} else {
				delete options.headers['Content-Type'];
			}

			if (options.accept) {
				options.headers['Accept'] = options.accept;
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
							sparta.handleParseError(this.response, options);
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
				this.ontimeout = null;
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
				this.ontimeout = null;
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
				this.ontimeout = null;
			};

			// Listen to timeouts
			req.ontimeout = function() {
				deferred.reject({
					data: null,
					statusCode: -2,
					statusText: 'timeout'
				});

				// Remove listeners
				this.onreadystatechange = null;
				this.onabort = null;
				this.onerror = null;
				this.ontimeout = null;
			};

			req.send(options.data || void 0);

			var extendedPromise = _.extend(deferred.promise, {
				abort: abortXHR.bind(req)
			});

			return extendedPromise;
		}(options);
	}

	function sparta (options) {
		return new Sparta(options);
	}

	sparta.ajaxDefaults = function (options) {
		globalSpartaOptions = _.extend(globalSpartaOptions || {}, options);
	};

	sparta.deferred = function () {
		return Q.defer();
	};

	sparta.handleParseError = function (response, options) {};

	return sparta;
}));
