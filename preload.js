const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    getAgeGroups: async () => {
        return ipcRenderer.invoke('get-age-groups');
    },
    openAddPlayerWindow: () => {
        ipcRenderer.send('open-add-player');
    },
    registerPlayer: (player) => ipcRenderer.invoke('register-player', player),
    loginPlayer: (creds) => ipcRenderer.invoke('login-player', creds),
    onPlayerAdded: (callback) => ipcRenderer.on('player-added', (_, player) => callback(player)),
    loadMenu: () => ipcRenderer.invoke('loadMenu'),
    leaderboard: (groups, categories) => ipcRenderer.invoke('leaderboard', { groups, categories }),
    startGame: (group, categories) => ipcRenderer.invoke('startGame', { group, categories }),
    answer: (questionId, selectedIndex) => ipcRenderer.invoke('answer', { questionId, selectedIndex }),

});