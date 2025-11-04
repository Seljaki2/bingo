const { contextBridge, ipcRenderer } = require('electron');

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
    // Fetches all age groups and categories
    loadMenu: () => ipcRenderer.invoke('loadMenu'),

    // Fetches leaderboard based on selected age groups and categories
    leaderboard: (groups, categories) =>
        ipcRenderer.invoke('leaderboard', { groups, categories }),

    // Starts a game for given age group, categories, and array of user ids
    startGame: (group, categories, players) =>
        ipcRenderer.invoke('startGame', { group, categories, players }),

    // Submits an answer and returns correctness, bingo, and updated board
    answer: (playerId, questionId, selectedIndex) =>
        ipcRenderer.invoke('answer', { playerId, questionId, selectedIndex }),
});
