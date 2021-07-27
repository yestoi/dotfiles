// ==UserScript==
// @name         Slack: Always Stay Active
// @namespace    https://ericdraken.com/slack-always-stay-active
// @version      1.0.1
// @description  Always stay active on Slack.
// @author       Eric Draken (ericdraken.com)
// @match        https://app.slack.com/client/*
// @icon         https://www.google.com/s2/favicons?domain=slack.com
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/* eslint-disable no-proto */
/* eslint-disable accessor-pairs */
/* eslint-disable no-global-assign */

((window, mutateEvent) => {
    'use strict';
    const INACTIVE_THRESHOLD_SECS = 60 * 5;
    const PING_THRESHOLD_SECS = 60;
    const PAGE_ERROR_THRESHOLD = 10;
    const GREEN = '#2bac76';
    const YELLOW = '#ac7f2b';
    const RED = '#ac3e2b';
    const GREY = '#d0d0d0';

    /** Do not change below this line **/

    const APPNAME = 'SLACK_ASA';
    const PING_MSG = {"type": "ping", "id": null};
    const PONG_MSG = {"type": "pong", "reply_to": null};
    const TYPING_MSG = {"type": "typing", "channel": null, "id": null};
    const TICKLE_MSG = {"type": "tickle", "id": null};
    const PRESENCE_ACTIVE_MSG = {"type": "presence_change", "presence": "active", "users": [null]};
    const PRESENCE_AWAY_MSG = {"type": "presence_change", "presence": "away", "users": [null]};
    const MANUAL_PRESENCE_ACTIVE_MSG = {"type": "manual_presence_change", "presence": "active"};
    const MANUAL_PRESENCE_AWAY_MSG = {"type": "manual_presence_change", "presence": "away"};
    const TEXT_MSG = {"type": "message", "user": null, "text": null};
    const PULSE_CLASS = 'asa-pulse';

    let errorCount = 0;
    let userId = '--not set--';

    // Prefix our messages with the app name and WS id for console filtering
    const protoConsole = {
        _socketId: '',
        _console: window.console || false,
        _doLog(level, color, ...args) {
            const ind = this._socketId !== '' ? `[${this._socketId}]` : '';
            this._console && this._console[level](`%c${APPNAME}${ind}:`, `color: ${color}`, ...args);
        },
        log(...args) {
            this._doLog('log', GREEN, ...args);
        },
        info(...args) {
            this._doLog('info', GREEN, ...args);
        },
        error(...args) {
            this._doLog('error', RED, ...args);
        },
        debug(...args) {
            this._doLog('debug', YELLOW, ...args);
        }
    };

    // Root logger
    const console = Object.assign({}, protoConsole, {_socketId: ''});

    const statusDiv = {
        id: 'SAA229064402df15c8079ac', // Something random
        _div: null,

        getStatusDiv() {
            if (this._div && this._div.style) {
                return this._div;
            }

            this._div = document.createElement('div');
            this._div.id = this.id;
            this._div.style.cssText = '' +
                'display:block;position:fixed;overflow:hidden;' +
                'top:0;left:0;width:100%;height:2px;opacity:0.5;' +
                'z-index:2147483647;background:#fff;'
            document.body.appendChild(this._div);

            // Animation - pulse effect on the banner
            const style = document.createElement('style');
            style.innerHTML = `
              .${PULSE_CLASS} {
                 animation-direction: normal;
                 animation: asapulse linear 1s 1;
              }
              @keyframes asapulse {
                0% {
                    -webkit-transform:scale(1);
                    -moz-transform:scale(1);
                    -ms-transform:scale(1);
                    -o-transform:scale(1);
                    transform:scale(1);
                }
                70% {
                    -webkit-transform:scale(4);
                    -moz-transform:scale(4);
                    -ms-transform:scale(4);
                    -o-transform:scale(4);
                    transform:scale(4);
                }
                100% {
                    -webkit-transform:scale(1);
                    -moz-transform:scale(1);
                    -ms-transform:scale(1);
                    -o-transform:scale(1);
                    transform:scale(1);
                }
              }`;
            document.head.appendChild(style);
            return this._div;
        },

        setActive() {
            const div = this.getStatusDiv();
            if (div.dataset.bg !== GREEN) {
                console.log('Set active');
            }
            div.dataset.bg = div.style.background = GREEN;
        },

        setAway() {
            const div = this.getStatusDiv();
            if (div.dataset.bg !== GREY) {
                console.log('Set away');
            }
            div.dataset.bg = div.style.background = GREY;
        },

        setBooting() {
            const div = this.getStatusDiv();
            div.style.background = YELLOW;
            this.doPulse();
            console.debug('Set booting');
        },

        setProblem(e) {
            const div = this.getStatusDiv();
            div.style.background = RED;
            this.doPulse();
            console.error(`Problem: ${e}`);
        },

        doPulse() {
            const div = this.getStatusDiv();
            div.classList.remove(PULSE_CLASS);
            div.getClientRects(); // Trigger a reflow
            div.classList.add(PULSE_CLASS);
            console.debug('Do pulse');
        }
    };

    // Of all the multiple XHR objects, only intercept the boot request's user id
    const xhrProtoOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function () {
        const that = this;
        if (window.XMLHttpRequest.prototype.open !== xhrProtoOpen) {
            window.XMLHttpRequest.prototype.open = xhrProtoOpen;
            that.addEventListener('load', (ev) => {
                const xConsole = Object.assign({}, protoConsole, {_socketId: 'XHR'});
                const bootData = JSON.parse(ev.currentTarget.responseText);
                // Get the logged-in user id
                try {
                    userId = bootData.self.id;
                    xConsole.log('My Slack user id:', userId);
                } catch (e) {
                    xConsole.error('Unable to get the logged in user id. Commands disabled.');
                    xConsole.log(JSON.stringify(bootData, null, 2));
                }
            });
        }
        xhrProtoOpen.apply(that, arguments);
    };

    const objMatchesProto = (protoMsg, testObj, contains) => {
        return Object.keys(protoMsg).every(key => {
            if (protoMsg[key] === null) {
                // Nulls in the proto values can be wild, but must exist
                return typeof testObj[key] !== 'undefined';
            } else if ((protoMsg[key] || {}).constructor === Array
                && (testObj[key] || {}).constructor === Array) {
                return testObj[key].includes(contains);
            }
            return protoMsg[key] === testObj[key];
        });
    };

    const WebSocketProxy = new Proxy(window.WebSocket, {
        construct(wsTarget, wsArgs) {
            const ws = new wsTarget(...wsArgs);

            // Configurable hooks
            ws.hooks = {
                interceptSend: () => null,
                listenReceive: () => null
            };

            // WS details
            ws.details = {
                _ws: ws,
                _console: {},
                _wantsActive: true,
                _hasProblem: false,
                _isPingChannel: false,
                _lastPingSent: Date.now(),
                _lastTickleSent: Date.now(),
                _protoMessageEvent: undefined,
                debug() {
                    return {
                        _wantsActive: this._wantsActive,
                        _hasProblem: this._hasProblem,
                        _isPingChannel: this._isPingChannel,
                        _lastPingSent: this._lastPingSent,
                        _lastTickleSent: this._lastTickleSent,
                    };
                },
                wantsActive() {
                    return this._wantsActive === true;
                },
                wantsAway() {
                    return this._wantsActive === false;
                },
                lastTickleElapsed() {
                    return Date.now() - this._lastTickleSent;
                },
                clearTickleTimestamp() {
                    this._ws.console.debug('Clearing last tickle timestamp');
                    this._lastTickleSent = 0;
                },
                lastPingElapsed() {
                    return Date.now() - this._lastPingSent;
                },
                isSocketReady() {
                    return this._isPingChannel;
                },
                hasTickleProblem() {
                    // If a tickle hasn't been sent in a while, return false
                    return this.lastTickleElapsed() > (INACTIVE_THRESHOLD_SECS + 120) * 1000;
                },
                hasSocketProblem() {
                    return this.lastPingElapsed() > PING_THRESHOLD_SECS * 1000;
                },
                hasPresenceProblem() {
                    return !(this.wantsActive() || this.wantsAway());
                },
                checkHasAnyInternalProblem() {
                    return this.hasSocketProblem() && this.hasTickleProblem() && this.hasPresenceProblem();
                },
                updateState() {
                    if (!this._hasProblem) {
                        if (this.hasTickleProblem()) {
                            this._hasProblem = true;
                            statusDiv.setProblem('A tickle has not been sent lately');
                        } else if (this.hasSocketProblem()) {
                            this._hasProblem = true;
                            statusDiv.setProblem('Pings are not being sent on time');
                        } else if (this.hasPresenceProblem()) {
                            this._hasProblem = true;
                            statusDiv.setProblem(`Manual presence change type is unknown: ${this._wantsActive}`);
                        } else if (this.isSocketReady()) {
                            // Set the bar color to active or away
                            if (this.wantsActive()) {
                                statusDiv.setActive();
                            } else if (this.wantsAway()) {
                                statusDiv.setAway();
                            }
                        }
                    } else if (!this.checkHasAnyInternalProblem()) {
                        this._hasProblem = false;
                    }
                }
            };

            // Intercept send
            ws.send = new Proxy(ws.send, {
                apply(target, thisArg, args) {
                    ws.hooks.interceptSend(args, ws);
                    ws.details.updateState();
                    return target.apply(thisArg, args);
                }
            });

            // Listen for messages
            ws.addEventListener('message', function (event) {
                ws.hooks.listenReceive(event, ws);
            });

            // Connection opened
            ws.addEventListener('open', function (event) {
                ws.console.log(`Open: ${event.target.url}`);
                statusDiv.setBooting();
            });

            // Connection closed
            ws.addEventListener('close', function (event) {
                statusDiv.setBooting();
                ws.console.log(`Close: ${event}`);
                errorOverwatch('Socket closed');
            });

            // Connection error
            ws.addEventListener('error', function (event) {
                statusDiv.setBooting();
                errorOverwatch(event);
            });

            ws.hooks.listenReceive = (event, currWs) => {
                const details = currWs.details;
                if (event && event.data) {
                    let obj = JSON.parse(event.data);

                    if (objMatchesProto(PONG_MSG, obj)) {
                        // Get one pong message event as a prototype
                        if (!details._protoMessageEvent) {
                            mutateEvent(event);
                            event.data = obj;
                            details._protoMessageEvent = event;
                            currWs.console.log('Got proto pong message event', details._protoMessageEvent);
                        }
                    }

                    // Detect manually away
                    else if (objMatchesProto(MANUAL_PRESENCE_AWAY_MSG, obj)) {
                        currWs.console.debug(`Manual away change detected: ${event.data}`);
                        details._wantsActive = false;
                        details.updateState();
                    }

                    // Detect manually active
                    else if (objMatchesProto(MANUAL_PRESENCE_ACTIVE_MSG, obj)) {
                        currWs.console.debug(`Manual active change detected: ${event.data}`);
                        details._wantsActive = true;
                        details.updateState();
                    }

                    // Detect network away
                    else if (objMatchesProto(PRESENCE_AWAY_MSG, obj, userId)) {
                        currWs.console.debug(`Away update detected: ${event.data}`);
                        details._wantsActive = false;
                        details.updateState();
                    }

                    // Detect network active
                    else if (objMatchesProto(PRESENCE_ACTIVE_MSG, obj, userId)) {
                        currWs.console.debug(`Active update detected: ${event.data}`);
                        details._wantsActive = true;
                        details.updateState();
                    }

                    // Listen for user commands
                    else if (objMatchesProto(TEXT_MSG, obj)) {
                        const keys = Object.keys(TEXT_MSG);
                        if (obj[keys[1]] === userId) {
                            const msg = (obj[keys[2]] || '').trim().toLowerCase();
                            switch (msg) {
                                case 'sigkill!':
                                case 'sigterm!':
                                    currWs.console.log('User SIGKILL received. Closing this window.');
                                    document.location.href = 'about:blank';
                                    break;
                                case 'sighup!':
                                    currWs.console.log('User SIGHUP received. Reloading this window.');
                                    document.location = document.location;
                                    break;
                            }
                        }
                    }
                }
            };

            ws.hooks.interceptSend = (data, currWs) => {
                const details = currWs.details;
                if (data && data.constructor === Array) {
                    let payload = data[0];
                    let obj = JSON.parse(payload);

                    if (objMatchesProto(PING_MSG, obj)) {
                        if (details._isPingChannel !== true) {
                            details._isPingChannel = true;
                            statusDiv.setBooting();
                            currWs.console.log(`Found the ping socket: ${data}`);
                        }
                        details._lastPingSent = Date.now();

                        // Hijack ping and replace with tickle
                        if (ws.details.isSocketReady()) {
                            details.updateState();
                            let tickleElapsed = ws.details.lastTickleElapsed();
                            if (tickleElapsed > INACTIVE_THRESHOLD_SECS * 1000) {
                                currWs.console.log(`Last activity ${tickleElapsed / 1000}s ago.
                                 Sending activity notification`);
                                details._lastTickleSent = Date.now();

                                // Pass by reference
                                const typeKey = Object.keys(PING_MSG)[0];
                                const idKey = Object.keys(PING_MSG)[1];
                                obj[typeKey] = TICKLE_MSG[typeKey];
                                data[0] = JSON.stringify(obj);
                                statusDiv.doPulse();

                                setTimeout((_ws, id) => {
                                    // Send a fake pong into the socket to fulfill the promise
                                    const replyKey = Object.keys(PONG_MSG)[1];
                                    const pong = Object.assign({}, PONG_MSG, {[replyKey]: id});
                                    _ws.console.debug('Sending a fake pong', pong);
                                    _ws.details._protoMessageEvent.data = pong;
                                    _ws.onmessage(_ws.details._protoMessageEvent);
                                }, 500, currWs, obj[idKey]);
                            }
                        }
                    } else if (objMatchesProto(TICKLE_MSG, obj) || objMatchesProto(TYPING_MSG, obj)) {
                        currWs.console.log(`Genuine activity notification: ${data}`);
                        details._lastTickleSent = Date.now();
                    }
                }
            }

            // Save reference
            window._websockets = window._websockets || [];
            window._websockets.push(ws);

            // One console per websocket
            ws.console = Object.assign({}, protoConsole, {_socketId: window._websockets.length - 1});

            return ws;
        }
    });

    // Catch oddball errors
    const errorOverwatch = (e) => {
        if (e && e.target && e.target === 'img') {
            return;
        }
        errorCount++;
        protoConsole.error(errorCount, e);
        if (errorCount >= PAGE_ERROR_THRESHOLD) {
            console.info("Too many errors. Reloading the page.");
            document.location = document.location;
        }
    };
    ['error', 'unhandledrejection'].forEach((name) => {
        window.addEventListener(name, errorOverwatch, {capture: true});
    });
    window.error = errorOverwatch;

    // Do the magic
    window.WebSocket = WebSocketProxy;

    // Debug commands from the console
    window.slackasa = {
        ticklenow() {
            window._websockets.forEach((ws) => {
                ws.details.clearTickleTimestamp();
            });
        },
        reload() {
            document.location = document.location;
        },
        listsockets() {
            window._websockets.forEach((ws) => {
                ws.console.log(JSON.stringify(
                    Object.assign({_isOpen: ws.readyState === ws.OPEN}, ws.details.debug()), null, 2));
            });
        },
        triggererror() {
            window.setTimeout(() => {
                throw new Error("Expected error!")
            }, 0);
        },
        triggerfatal() {
            errorCount = PAGE_ERROR_THRESHOLD - 1;
            this.triggererror();
        }
    };
})(unsafeWindow || window, (immutableEvent) => {
    const isStrict = (function () {
        return !this;
    })();
    if (isStrict) {
        throw new Error("This won't work in strict mode");
    }
    // Outside of the strict scope
    Object.defineProperty(immutableEvent, "data", {
        _data: {},
        set: function (obj) {
            this._data = JSON.stringify(obj);
        },
        get: function () {
            return this._data;
        }
    })
});

