document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tb-min').addEventListener('click', (e) => {
        API.minWindow();
    });

    document.getElementById('tb-max').addEventListener('click', (e) => {
        API.maxWindow();
    });

    document.getElementById('tb-close').addEventListener('click', (e) => {
        API.closeWindow();
    });

    let toggleHidden = (id) => {
        let elem = document.getElementById(id);
        if(elem.type === "password")
            elem.type = "text";
        else
            elem.type = "password"
    }

    document.getElementById('show|t_password').onclick = () => { toggleHidden('t_password'); }
    document.getElementById('show|ud_key').onclick = () => { toggleHidden('ud_key'); }
    document.getElementById('show|ud_secret').onclick = () => { toggleHidden('ud_secret'); }
    document.getElementById('back|form').onclick = () => { document.getElementById('config-form').classList.toggle('hide', true); }
    document.getElementById('save|form').onclick = () => {
        let config = {
            twitch: [{
                username: document.getElementById('t_username')?.value || undefined,
                password: document.getElementById('t_password')?.value || undefined,
                channels: [document.getElementById('t_channel')?.value || undefined]
            }],
            uberduck: [{
                key: document.getElementById('ud_key')?.value || undefined,
                secret: document.getElementById('ud_secret')?.value || undefined
            }],
            voice: document.getElementById('t_voice').value || undefined
        }

        if(typeof(config.twitch[0].username) !== 'string' || typeof(config.twitch[0].password) !== 'string' ||
            typeof(config.uberduck[0].key) !== 'string' || typeof(config.uberduck[0].secret) !== 'string') {
            alert('Missing required fields.');
        } else {
            API.saveConfig(config);
            document.getElementById('config-form').classList.toggle('hide', true);
        }
    }

    document.getElementById('settings-icon').onclick = () => { document.getElementById('config-form').classList.toggle('hide'); }
    document.getElementById('skip-chat').onclick = stopAudio;

    message = document.getElementById('message');
    chatter = document.getElementById('chatter');
    skipper = document.getElementById('skip-chat');
});

let current_filename;
let stopAudio = () => { tts.pause(); tts.currentTime = 0; hideTTS(); API.deleteFile(current_filename); }

let message;
let chatter;
let skipper;

var config, tts = new Audio();
window.addEventListener("message", async (event) => {
    const message = event.data;
    if(message.id === 'config') {
        config = JSON.parse(message.data);
        document.getElementById('t_username').value = config?.twitch[0]?.username || '';
        document.getElementById('t_password').value = config?.twitch[0]?.password || '';
        document.getElementById('t_channel').value = config?.twitch[0]?.channels[0] || '';
        document.getElementById('t_voice').value = config?.voice || '';
        document.getElementById('ud_key').value = config?.uberduck[0]?.key || '';
        document.getElementById('ud_secret').value = config?.uberduck[0]?.secret || '';
    } else if(message.id === 'pause-state') {
        
    } else if(message.id === 'sound-path') {
        showTTS(message.data?.options)
        tts.src = message.data.path;
        current_filename = message.data.name;

        setTimeout(() => {
            tts.play();
        }, 200);
        
        tts.onended = () => {
            setTimeout(() => {
                stopAudio();
            }, 100);
        }
    }
});

const showTTS = (data) => {
    if(data.message.length < 100) {
        message.style.fontSize = undefined;
        chatter.style.fontSize = undefined;
    } else {
        message.style.fontSize = "30px";
        chatter.style.fontSize = "18px";
    }

    message.textContent = data.message;
    chatter.textContent = '- ' + data.username

    message.classList.toggle('display-text', true);
    chatter.classList.toggle('display-text', true);
    skipper.classList.toggle('display-text', true);
    skipper.classList.toggle('no-events', false);
}

const hideTTS = () => {
    message.classList.toggle('display-text', false);
    chatter.classList.toggle('display-text', false);
    skipper.classList.toggle('display-text', false);

    let func = () => {
        message.textContent = '';
        chatter.textContent = '';
        skipper.classList.toggle('no-events', true);
        message.removeEventListener('transitionend', func);
    }

    message.addEventListener('transitionend', func);
}