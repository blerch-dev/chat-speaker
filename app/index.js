const sdk = require('uberduck-api');
class UberDuck {
    constructor(data = {}) {
        this.key = data?.key || undefined;
        this.secret = data?.secret || undefined;
    }

    setConfig = (data) => {
        this.key = data?.key || this.key;
        this.secret = data?.secret || this.secret;

        return this;
    }

    async getUrl(char, message) {
        return await new Promise((res, rej) => {
            sdk.getAudioUrl(this.key, this.secret, char, message).then((url) => {
                res(url);
            });
        });
    }
}

const tmi = require('tmi.js');
class TwitchChatBot {
    constructor(cb, data = {}) {
        this.setConfig(data, {
            username: undefined,
            password: undefined,
            channels: []
        });

        this.ignored_tags = data?.ignored_tags || [];
        this.ignored_phrases = data?.ignored_phrases || []; // not implemented

        this.setClient(cb);
    }

    isConnected() { return this.client.readyState() !== 'CLOSED' && this.client.readyState() !== 'CLOSING'; }
    isClient() { return this.client instanceof tmi.Client }

    async connect() {
        if(this.isConnected())
            await this.client.disconnect();

        return await this.client.connect();
    }

    setConfig = (data, dv = {}) => {
        this.username = data?.username || this.username || dv?.username;
        this.password = data?.password || this.password || dv?.password;
        this.channels = data?.channels || this.channels || dv?.channels;
        this.channels = Array.isArray(this.channels) ? this.channels.filter((c) => typeof(c) === 'string') : [];

        return this;
    }

    /*
        [17:56] error: Cannot disconnect from server. Socket is not opened or connection is already closing.
        (node:31384) UnhandledPromiseRejectionWarning: Cannot disconnect from server. Socket is not opened or connection is already closing.
        (Use `electron --trace-warnings ...` to show where the warning was created)
        (node:31384) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 2)
        [17:56] error: Could not connect to server. Reconnecting in 2 seconds..
        (node:31384) UnhandledPromiseRejectionWarning: Connection closed.
        (node:31384) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 3)
        (base) PS C:\Users\bwben\Documents\Code\chat-speaker>

        // Error when disconnecting with full queue (i think)
    */

    setClient = async (cb) => {
        if(this.client instanceof tmi.Client) {
            if(this.isConnected())
                await this.client.disconnect();
        }

        if(cb == undefined || this.channels.length < 1)
            return;

        this.client = new tmi.Client({
            connection: { secure: true, reconnect: true },
            identity: { username: this.username, password: this.password },
            channels: Array.isArray(this.channels) ? this.channels : [this.channels]
        });

        this.client.on('message', (channel, tags, message, self) => {
            if(self || this.ignored_tags.includes(tags.username))
                return;
    
            cb(channel, tags, message, self);
        });
    }
}

const fs = require('fs');
class AudioManager {
    constructor(download, send, data = {}) {
        this.download = download;
        this.send = send;

        this.paused = false;
        this.playing = false;
        this.spt = Date.now();
        this.queue = [];

        this.voice = data?.voice || 'eminem';

        this.setConfig(data);
    }

    onMessage = (channel, tags, message, self) => {
        //console.log(`${tags.username}: ${message}`);
        // Options for chat filtering here
        if(this.paused === true)
            return;

        // Percent Chance
        if(Math.random() < (0.5 - (this.queue.length/5))) {
            let queue_length = this.queue.push({ channel, tags, message, self });
            if(!this.playing && queue_length === 1)
                this.readMessage(this.queue.shift());
        }
    }

    onFinish = () => {
        this.playing = false;
        if(this.queue.length > 0)
            this.readMessage(this.queue.shift());
    }

    readMessage = async (data) => {
        if(this.paused === true)
            return;

        if(this.playing) {
            if(Date.now() - this.spt > (3 * 60 * 1000)) { // 3 minutes till auto play
                this.playing = false;
            } else {
                return; // skip if playing
            }
        }

        const { channel, tags, message, self } = data;
        let character = this.voice;
        let url = await this.uberduck.getUrl(character, message);
        if(typeof(url) === 'string') {
            let result = await this.download(url);
            if(result instanceof Error) {
                console.error('Download Failed.', result);
            } else {
                this.playing = this.send(result.path, result.name, {
                    message: message,
                    username: tags.username
                });

                if(this.playing)
                    this.spt = Date.now();
            }
        } 
    }

    setConfig = (data) => {
        let preferred_uber = data?.uberduck?.filter((ub) => ub.preferred)[0] || data?.uberduck[0] || undefined;
        let preferred_twitch = data?.twitch?.filter((t) => t.preferred)[0] || data?.twitch[0] || undefined;

        if(this.uberduck instanceof UberDuck)
            this.uberduck.setConfig(preferred_uber);
        else
            this.uberduck = new UberDuck(preferred_uber);

        if(this.twitchbot instanceof TwitchChatBot)
            this.twitchbot.setConfig(preferred_twitch).setClient(this.onMessage);
        else
            this.twitchbot = new TwitchChatBot(this.onMessage, preferred_twitch);

        if(this.twitchbot instanceof TwitchChatBot && this.twitchbot.isClient())
            this.twitchbot.connect();
    }
}

const request = require('request');
const { app, BrowserWindow, ipcMain } = require('electron');
const pkg = require('../package.json');
class App {
    constructor(data = {}) {
        this.app_path = (process.env.APPDATA || (process.platform == 'darwin' ? 
            process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share")) + '/chat-speaker/.app/';

        if(!fs.existsSync(this.app_path))
            fs.mkdirSync(this.app_path, { recursive: true });

        this.window;
        this.getConfig().then((output) => {
            this.audioManager = new AudioManager(this.downloadFile, this.playSound, output);
        })
    }

    async updateConfig(json, default_value = undefined, ignore_am = false) {
        let config = this.latestConfig ?? default_value ?? await this.getConfig();
        config.twitch = json?.twitch ?? config?.uberduck;
        config.uberduck = json?.uberduck ?? config?.uberduck;
        config.voice = json?.voice ?? config?.voice;
        config.version = pkg?.version;
        config.paused = json?.paused ?? config?.paused;

        let result = await fs.promises.writeFile(this.app_path + 'config.json', JSON.stringify(config));
        if(!ignore_am)
            this.audioManager.setConfig(config);

        return result;
    }

    async getConfig() {
        let filepath = this.app_path + 'config.json';
        try {
            this.latestConfig = JSON.parse((await fs.promises.readFile(filepath)).toString());
            return this.latestConfig;
        } catch(err) {
            if(err.code === 'ENOENT') {
                let data = { uberduck: [], twitch: [], voice: undefined, version: pkg.version };
                await this.updateConfig(undefined, data, true);
                return data;
            }
    
            return { Error: "JSON parse failed." };
        }
    }

    async deleteFile(filename) {
        if(typeof(filename) !== 'string') return;
        return await fs.promises.rm(this.app_path + filename);
    }

    downloadFile = async (url) => {
        if(typeof(url) !== 'string')
            return new Error('No url given.');

        let filename = `tmp-${Date.now()}.wav`;
        let ws = fs.createWriteStream(this.app_path + filename);
        let promise = new Promise((r) => {
            ws.on('close', () => { r({ path: this.app_path + filename, name: filename }); });
            request.get(url).on('error', (err) => { r(err); }).pipe(ws);
        });

        return await promise;
    }

    playSound = async (fullpath, filename, data) => {
        if(this.window instanceof BrowserWindow) {
            this.window.webContents.send('sound-path', { path: fullpath, name: filename, options: data });
            return true;
        }

        return false;
    }

    async Start() {
        app.on('window-all-closed', () => { if(process.platform !== 'darwin') { app.quit(); } });
        app.disableHardwareAcceleration();
        await app.whenReady();

        this.window = new BrowserWindow({
            width: 800,
            height: 350,
            show: false,
            frame: false,
            icon: undefined,
            backgroundColor: '#00000B',
            webPreferences: {
                preload: __dirname + '/preload.js',
                sandbox: false,
                // webSecurity: false
            }
        });
    
        this.window.loadFile(__dirname + '/index.html');
        this.window.webContents.send('config', JSON.stringify(await this.getConfig()));
        this.window.on('ready-to-show', () => { this.window.show(); });
        
        ipcMain.on('minimize', (event, ...args) => {
            this.window.minimize();
        });
        
        ipcMain.on('maximize', (event, ...args) => {
            if(this.window.isMaximized()) { this.window.restore(); } else { this.window.maximize(); }
        });
        
        ipcMain.on('close', (event, ...args) => {
            this.window.close();
        });
    
        ipcMain.on('delete-file', (event, ...args) => {
            this.deleteFile(args[0]);
            this.audioManager.onFinish();
        });
    
        ipcMain.on('config-update', (event, ...args) => {
            this.updateConfig(args[0]);
        });

        ipcMain.on('toggle-pause', (event, ...args) => {
            this.audioManager.paused = typeof(args[0]) === 'boolean' ? args[0] : !this.audioManager.paused;
            event.reply('pause-state', this.audioManager.paused);
        });
    }
}

module.exports = {
    App
}