const WebSocket = require('ws');
const tls = require('tls');
const extractJson = require('extract-json-string');
const fs = require('fs');
const { performance } = require('perf_hooks');

const config = {
    token: "isa baba token",
    serverid: "urlyi cekcegın guild  id",
    logChannelId: "log aticak kanal"
};

let guilds = {};
let lastSeq = null;
let hbInterval = null;
let mfaToken = null;
let mfaTokenLastChecked = 0;
let lastMfaFileTime = 0;

async function sendLog(message) {
    try {
        await req("POST", `/api/v7/channels/${config.logChannelId}/messages`, JSON.stringify({
            content: message
        }));
    } catch (e) {}
}

function safeExtract(d) {
    if (typeof d !== 'string') {
        try {
            return JSON.stringify(d);
        } catch (e) {
            return null;
        }
    }
    try {
        return extractJson.extract(d);
    } catch (e) {
        return null;
    }
}

function readMfaToken(force = false) {
    const now = Date.now();
    try {
        const stats = fs.statSync('mfa.txt');
        if (mfaToken && stats.mtimeMs <= lastMfaFileTime && !force) {
            return mfaToken;
        }

        lastMfaFileTime = stats.mtimeMs;
        const data = fs.readFileSync('mfa.txt', 'utf8');
        const tokenFromFile = data.trim();

        if (tokenFromFile) {
            if (tokenFromFile !== mfaToken) {
                mfaToken = tokenFromFile;
            } else {
                mfaToken = tokenFromFile;
            }
            mfaTokenLastChecked = now;
            return mfaToken;
        }
    } catch (e) {
    }
    return mfaToken;
}

async function req(method, path, body = null) {
    return new Promise(resolve => {
        const socket = tls.connect({
            host: 'canary.discord.com',
            port: 443,
            rejectUnauthorized: false,
            timeout: 5000,
            keepAlive: true,
            secureProtocol: 'TLSv1_2_method',
            ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384',
            honorCipherOrder: true
        }, () => {
            const headers = [
                `${method} ${path} HTTP/1.1`,
                'Host: canary.discord.com',
                `Authorization: ${config.token}`,
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
                'X-Super-Properties: eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIn0='
            ];

            if (mfaToken) {
                headers.push(`X-Discord-MFA-Authorization: ${mfaToken}`);
            }
            if (body) {
                headers.push('Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`);
            }
            headers.push('Connection: close', '', body || '');
            socket.write(headers.join('\r\n'));

            let data = '';
            socket.on('data', chunk => data += chunk.toString());

            socket.on('end', () => {
                const headerEnd = data.indexOf('\r\n\r\n');
                if (headerEnd === -1) {
                    resolve('{}');
                    return socket.destroy();
                }

                let responseBody = data.slice(headerEnd + 4);
                if (data.toLowerCase().includes('transfer-encoding: chunked')) {
                    let result = '';
                    let offset = 0;
                    while (offset < responseBody.length) {
                        const end = responseBody.indexOf('\r\n', offset);
                        if (end === -1) break;
                        const size = parseInt(responseBody.substring(offset, end), 16);
                        if (size === 0) break;
                        result += responseBody.substring(end + 2, end + 2 + size);
                        offset = end + 2 + size + 2;
                    }
                    responseBody = result || '{}';
                }

                if (!path.includes('/vanity-url')) {
                    const extracted = safeExtract(responseBody);
                    if (extracted) {
                        resolve(extracted);
                        return socket.destroy();
                    }
                }
                resolve(responseBody);
                socket.destroy();
            });

            socket.on('error', () => {
                resolve('{}');
                socket.destroy();
            });
        });

        socket.setTimeout(250, () => {
            resolve('{}');
            socket.destroy();
        });
    });
}

function connect() {
    req("GET", "/api/v7/gateway").then(res => {
        let url;
        try {
            url = JSON.parse(res)?.url;
        } catch (e) {
            const extracted = safeExtract(res);
            if (extracted) {
                try {
                    url = JSON.parse(extracted)?.url;
                } catch (e) {}
            }
        }

        const ws = new WebSocket(url || "wss://gateway.discord.gg/?v=9&encoding=json");

        ws.on("open", () => {
            ws.send(JSON.stringify({
                op: 2,
                d: {
                    token: config.token,
                    intents: 513,
                    properties: {
                        os: "Linux",
                        browser: "Firefox",
                        device: "Allah"
                    }
                }
            }));
        });

        ws.on("message", async data => {
            try {
                let payload;
                try {
                    payload = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
                } catch (e) {
                    const extracted = safeExtract(data.toString());
                    if (extracted) {
                        payload = JSON.parse(extracted);
                    } else {
                        return;
                    }
                }
                if (payload.s) lastSeq = payload.s;
                if (payload.op === 10) {
                    clearInterval(hbInterval);
                    hbInterval = setInterval(() => {
                        ws.send(JSON.stringify({ op: 1, d: lastSeq }));
                    }, payload.d.heartbeat_interval);
                }
                if (payload.t === "READY") {
                    payload.d.guilds.filter(g => g.vanity_url_code).forEach(g => {
                        guilds[g.id] = {
                            code: g.vanity_url_code,
                            name: g.name
                        };
                    });
                }
                if (payload.t === "GUILD_UPDATE") {
                    const id = payload.d.id || payload.d.guild_id;
                    const oldGuild = guilds[id];
                    const newCode = payload.d.vanity_url_code;
                    const guildName = payload.d.name;
                    if (oldGuild && oldGuild.code !== newCode) {
                        readMfaToken();
                        if (mfaToken) {
                            const patchPayload = JSON.stringify({ code: oldGuild.code });
                            const promises = [
                                req("PATCH", `/api/v7/guilds/${config.serverid}/vanity-url`, patchPayload),
                                req("PATCH", `/api/v8/guilds/${config.serverid}/vanity-url`, patchPayload),
                                req("PATCH", `/api/v10/guilds/${config.serverid}/vanity-url`, patchPayload),
                                req("PATCH", `/api/guilds/${config.serverid}/vanity-url`, patchPayload)
                            ];
                            const startTime = performance.now();
                            await Promise.all(promises);
                            const endTime = performance.now();

                            sendLog(`guild patch\n*GUILD NAME* : ${guildName}\n***Vanity*** : ${oldGuild.code}\n`);
                        }
                    }
                    if (newCode) {
                        guilds[id] = {
                            code: newCode,
                            name: guildName
                        };
                    } else if (guilds[id]) {
                        delete guilds[id];
                    }
                }
                if (payload.t === "GUILD_DELETE") {
                    const deletedGuild = guilds[payload.d.id];
                    if (deletedGuild) {
                        readMfaToken();
                        if (mfaToken) {
                            const patchPayload = JSON.stringify({ code: deletedGuild.code });
                            const promises = [
                                req("PATCH", `/api/v7/guilds/${config.serverid}/vanity-url`, patchPayload),
                                req("PATCH", `/api/v8/guilds/${config.serverid}/vanity-url`, patchPayload),
                                req("PATCH", `/api/v10/guilds/${config.serverid}/vanity-url`, patchPayload)
                            ];
                            const startTime = performance.now();
                            await Promise.all(promises);
                            const endTime = performance.now();

                            sendLog(`**GUILD DELETE!**\n*DELETED GUILD NAME* : ${deletedGuild.name}\nVanity URL: ${deletedGuild.code}\n||${(endTime - startTime).toFixed(2)}ms||`);
                        }
                        delete guilds[payload.d.id];
                    }
                }
            } catch (e) {
                console.error("Error:", e.message);
            }
        });
        ws.on("close", () => {
            clearInterval(hbInterval);
            setTimeout(connect, 500);
        });
        ws.on("error", () => ws.close());
    }).catch(() => setTimeout(connect, 500));
}
(async () => {
    readMfaToken(true);
    connect();
    setInterval(() => readMfaToken(false), 30000);
})();
process.on('uncaughtException', (e) => {
    console.error("Unexpected error:", e.message);
});
