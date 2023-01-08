const sdk = require('uberduck-api');
class UberDuck {
    constructor(data = {}) {
        this.key = data?.key || undefined;
        this.secret = data?.secret || undefined;
    }

    setConfig(data) {
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
        this.username = data?.username || undefined;
        this.password = data?.password || undefined;
        this.channels = data?.channels || [];

        this.ignored_tags = data?.ignored_tags || [];
        this.ignored_phrases = data?.ignored_phrases || []; // not implemented

        this.setClient(cb);
    }

    isConnected() { return this.client.readyState() !== 'CLOSED' }

    async connect() {
        if(this.isConnected())
            await this.client.disconnect();

        return await this.client.connect();
    }

    setConfig(data) {
        this.username = data?.username || this.username;
        this.password = data?.password || this.password;
        this.channels = data?.channels || this.channels;

        return this;
    }

    setClient(cb) {
        if(cb == undefined)
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

        this.voice = data?.voice || 'eminem';

        this.setConfig(data);
    }

    onMessage = async (channel, tags, message, self) => {
        //console.log(`${tags.username}: ${message}`);
        // Options for chat filtering here

        let character = this.voice;
        let url = await this.uberduck.getUrl(character, message);
        if(typeof(url) === 'string') {
            let result = await this.download(url);
            if(result instanceof Error) {
                console.error('Download Failed.', result);
            } else {
                this.send(result.path, result.name, {
                    message: message,
                    username: tags.username
                });
            }
        } 
    }

    setConfig(data) {
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
        }
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
        });
    
        ipcMain.on('config-update', (event, ...args) => {
            this.updateConfig(args[0]);
        });
    }
}

module.exports = {
    App
}