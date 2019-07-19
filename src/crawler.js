const Apify = require('apify');
const rp = require('request-promise');
const tough = require('tough-cookie');
const {getHostname, getCurrency} = require('./utils')

// TODO clean the session part

class SessionCheerioCrawler extends Apify.CheerioCrawler {
    constructor(options) {
        super(options);
        this.sessions = {};
        this.maxSessions = options.maxSessions || 100;
        this.maxSessionUsage = options.maxSessionUsage || 80;
        this.proxyPassword = process.env.APIFY_PROXY_PASSWORD;
        this.currency = options.currency || 'USD';
    }

    __createSession() {
        const jar = rp.jar();
        return {
            name: Math.random().toString(),
            usage: 0,
            userAgent: Apify.utils.getRandomUserAgent(),
            jar,
            blocks: 0,
        };
    }

    __pickSession() {
        const sessionsKeys = Object.keys(this.sessions);

        const randomNumber = Math.random();
        const chanceToPickSession = sessionsKeys.length / this.maxSessions;
        const willPickSession = chanceToPickSession > randomNumber;

        if (willPickSession) {
            const indexToPick = Math.floor(sessionsKeys.length * Math.random());
            const nameToPick = sessionsKeys[indexToPick];
            const session = this.sessions[nameToPick];
            session.usage++;
            if (session.usage >= this.maxSessionUsage) {
                this.dropSession(session.name);
            }

            return session;
        }

        const session = this.__createSession();
        this.sessions[session.name] = session;

        return session;
    }

    _getRequestOptions(request) {
        const session = this.__pickSession();

        const cookie = new tough.Cookie({
            key: 'i18n-prefs',
            value: getCurrency(request),
            domain: getHostname(request),
            httpOnly: true,
            maxAge: 31536000,
        });
        session.jar.setCookie(cookie.toString(), request.url);

        // eslint-disable-next-line no-underscore-dangle
        request.userData._session = session;
        const mandatoryRequestOptions = {
            url: request.url,
            method: request.method,
            headers: Object.assign({}, request.headers, {
                'User-Agent': session.userAgent,
                Accept: 'text/html',
                'Accept-Encoding': 'gzip, deflate',
            }),
            strictSSL: !this.ignoreSslErrors,
            proxy: this._getProxyUrl(session.name),
            jar: session.jar,
        };
        return Object.assign({}, this.requestOptions, mandatoryRequestOptions);
    }

    async _defaultRequestFunction({ request }) {
        try {
            // eslint-disable-next-line no-underscore-dangle
            const response = await super._defaultRequestFunction({ request });
            return response;
        } catch (e) {
            if (e.message.includes('To discuss automated access to Amazon data')) {
                // eslint-disable-next-line no-underscore-dangle
                const sessionName = request.userData._session.name;
                this.sessionBlocked(sessionName);
                await Apify.utils.sleep(3500);
                throw new Error('Blocked by 503');
            }

            throw e;
        }
    }

    _getProxyUrl(proxySession) {
        if (this.useApifyProxy && (this.apifyProxyGroups && this.apifyProxyGroups.length)) {
            return `http://groups-${this.apifyProxyGroups.join('+')},session-${proxySession},country-US:${this.proxyPassword}@proxy.apify.com:8000`;
        }
        if (this.useApifyProxy && (!this.apifyProxyGroups || this.apifyProxyGroups.length === 0)) {
            return `http://session-${proxySession},country-US:${this.proxyPassword}@proxy.apify.com:8000`;
        }

        if (this.proxyUrls) {
            return this.proxyUrls[this.lastUsedProxyUrlIndex++ % this.proxyUrls.length];
        }

        return null;
    }

    dropSession(sessionName) {
        if (this.sessions[sessionName]) {
            delete this.sessions[sessionName];
        }
    }

    sessionBlocked(sessionName) {
        const session = this.sessions[sessionName];
        if (!session) {
            return;
        }

        session.blocks++;
        if (session.blocks > 3) {
            this.dropSession(sessionName);
        }
    }
}

module.exports = SessionCheerioCrawler;
