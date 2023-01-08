const { contextBridge, ipcRenderer } = require('electron');

const api = {
    minWindow: () => { ipcRenderer.send('minimize'); },
    maxWindow: () => { ipcRenderer.send('maximize'); },
    closeWindow: () => { ipcRenderer.send('close'); },

    deleteFile: (filepath) => { ipcRenderer.send('delete-file', filepath); },
    saveConfig: (config) => { ipcRenderer.send('config-update', config); }
}

contextBridge.exposeInMainWorld('API', api);

ipcRenderer.on('sound-path', (event, ...args) => {
    window.postMessage({ id: 'sound-path',  data: args[0]});
});

ipcRenderer.on('config', (event, ...args) => {
    window.postMessage({ id: 'config', data: args[0]});
});