require('dotenv').config();
const {app, BrowserWindow, ipcMain} = require('electron/main');
const path = require('node:path');

// supabase
const {createClient} = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

let win, add_player_window;

const createWindow = () => {
    win = new BrowserWindow({
        width: 800,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.loadFile('index.html');
}

function createAddPlayerWindow() {
    if (add_player_window) return;

    add_player_window = new BrowserWindow({
        width: 500,
        height: 600,
        parent: win,
        modal: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    add_player_window.loadFile('add_player.html');

    add_player_window.on('closed', () => {
        add_player_window = null;
    });
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong');
    createWindow();

    // macOS
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('get-age-groups', async () => {
    const {data, error} = await supabase.from('AgeGroups').select('*');
    if (error) return {error: error.message};
    return data;
});

ipcMain.on('open-add-player', () => {
    createAddPlayerWindow();
});

ipcMain.handle('register-player', async (_, player) => {
    try {
        const { data, error } = await supabase
            .from('User')
            .insert(player)
            .select()
            .single();
        if (error) throw error;

        win.webContents.send('player-added', data);
        add_player_window?.close();
        return { success: true, data };
    } catch (err) {
        console.error('Error registering player:', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('login-player', async (_, creds) => {
    try {
        const { data, error } = await supabase
            .from('User')
            .select('*')
            .eq('username', creds.username)
            .eq('password', creds.password)
            .maybeSingle();
        if (error) throw error;

        if (!data) return { success: false, error: 'Invalid username or password' };

        win.webContents.send('player-added', data);
        add_player_window?.close();
        return { success: true, data };
    } catch (err) {
        console.error('Error logging in player:', err.message);
        return { success: false, error: err.message };
    }
});

let currentGame = null;

function createBingoBoard() {
    const board = Array.from({length: 5}, () => Array(5).fill(false));
    board[2][2] = true;
    return board;
}

function selectRandomSquare(board) {
    const unselected = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (!board[r][c]) unselected.push([r, c]);
        }
    }
    if (unselected.length === 0) return null;
    return unselected[Math.floor(Math.random() * unselected.length)];
}

function hasBingo(board) {
    for (let r = 0; r < 5; r++) {
        if (board[r].every(Boolean)) return true;
    }
    for (let c = 0; c < 5; c++) {
        if (board.map(row => row[c]).every(Boolean)) return true;
    }
    if ([0, 1, 2, 3, 4].every(i => board[i][i])) return true;
    if ([0, 1, 2, 3, 4].every(i => board[i][4 - i])) return true;

    return false;
}

/**
 * loadMenu
 * Returns all AgeGroups and Categories
 */
ipcMain.handle('loadMenu', async () => {
    try {
        const [{data: ageGroups, error: ageErr}, {data: categories, error: catErr}] = await Promise.all([
            supabase.from('AgeGroups').select('*').order('min_age', {ascending: true}),
            supabase.from('Category').select('*').order('name', {ascending: true}),
        ]);

        if (ageErr) throw ageErr;
        if (catErr) throw catErr;

        return {ageGroups, categories};
    } catch (err) {
        return {error: err.message};
    }
});


/**
 * leaderboard
 * Params: { groups: number[], categories: number[] }
 * Returns: list of leaderboard entries joined with User info
 */
ipcMain.handle('leaderboard', async (event, {groups, categories}) => {
    try {
        const {data, error} = await supabase
            .from('Leaderboard')
            .select(`
                id,
                score,
                created_at,
                age_group_id,
                user_id,
                category_id,
                User ( first_name, last_name )
            `)
            .in('age_group_id', groups)
            .in('category_id', categories)
            .order('score', {ascending: false});

        if (error) throw error;

        return data;
    } catch (err) {
        return {error: err.message};
    }
});

/**
 * startGame
 * Params: { group: number, categories: number[], players: number[] }
 * Returns: questions + initialized boards for each player
 */
ipcMain.handle('startGame', async (event, { group, categories, players }) => {
    try {
        if (!Array.isArray(categories) || categories.length === 0)
            throw new Error('categories must be a non-empty array');

        if (!Array.isArray(players) || players.length === 0)
            throw new Error('players must be a non-empty array of user IDs');

        // Fetch questions
        const { data, error } = await supabase
            .from('Questions')
            .select('id, text, answers, image_path, category_id, age_group_id')
            .eq('age_group_id', group)
            .in('category_id', categories);

        if (error) throw error;

        const questions = data.map(q => ({
            id: q.id,
            text: q.text,
            options: q.answers,
            image_path: q.image_path,
            category_id: q.category_id,
            age_group_id: q.age_group_id
        }));

        currentGame = {
            ageGroup: group,
            categories,
            questions,
            players: players.map((user_id, i) => ({
                id: i,
                user_id,
                board: createBingoBoard()
            })),
        };

        return {
            questions,
            players: currentGame.players.map(p => ({
                id: p.id,
                user_id: p.user_id,
                board: p.board
            })),
        };

    } catch (err) {
        return { error: err.message };
    }
});

/**
 * answer
 * Params: { playerId, questionId, selectedIndex }
 * Returns: { correct, bingo, board }
 */
ipcMain.handle('answer', async (event, {playerId, questionId, selectedIndex}) => {
    console.log(0)
    try {
        let existing;
        let stringBuilder;
        if (!currentGame) throw new Error('No game in progress');

        const player = currentGame.players.find(p => p.id === playerId);
        if (!player) throw new Error('Invalid player ID');

        if (hasBingo(player.board)) {
            return {
                error: 'Player already has bingo',
                bingo: true,
                board: player.board
            };
        }

        const question = currentGame.questions.find(q => q.id === questionId);
        if (!question) throw new Error('Question not found');

        const {data, error} = await supabase
            .from('Questions')
            .select('correct_answer')
            .eq('id', questionId)
            .single();

        if (error) throw new Error("1");

        const correct = data.correct_answer === selectedIndex;
        let bingo = false;
        let points = 0;

        if (correct) {
            points += 10;

            const pos = selectRandomSquare(player.board);
            if (pos) {
                const [r, c] = pos;
                player.board[r][c] = true;
            }

            if (hasBingo(player.board)) {
                bingo = true;
                points += 100;
            }

            const {data, error: fetchErr} = await supabase
                .from('Leaderboard')
                .select('*')
                .eq('user_id', player.user_id)
                .eq('age_group_id', question.age_group_id)
                .eq('category_id', question.category_id)

            const existing = (data.length === 0) ? null : data[0];

            if (fetchErr) throw fetchErr;

            if (existing) {
                points += existing.score
                const {error: updateErr} = await supabase
                    .from('Leaderboard')
                    .update({score: points})
                    .eq('id', existing.id);

                console.log(3)

                if (updateErr) throw updateErr;
            } else {
                const {error: insertErr} = await supabase.from('Leaderboard').insert({
                    user_id: player.user_id,
                    age_group_id: question.age_group_id,
                    category_id: question.category_id,
                    score: points,
                });
                console.log(4)
                if (insertErr) throw insertErr;
            }
        }

        return {correct, bingo, board: player.board};
    } catch (err) {
        console.error(err);
        return {error: err.message};
    }
});
