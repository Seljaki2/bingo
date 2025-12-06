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
    // `tile` is optional: { r: number, c: number } to mark a specific board cell when correct
    answer: (playerId, questionId, selectedIndex, tile) =>
        ipcRenderer.invoke('answer', { playerId, questionId, selectedIndex, tile }),

    endGame: () => ipcRenderer.invoke('endGame'),

    // Adds a new question. `question` should include: text, answers (array), correct_answer (int),
    // category_id, age_group_id, and optionally image_path (local file path from renderer).
    addQuestion: (question) => ipcRenderer.invoke('addQuestion', question),
});
