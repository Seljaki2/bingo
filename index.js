require('dotenv').config();
const {app, BrowserWindow, ipcMain} = require('electron/main')
const path = require('node:path')

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
    })
    win.loadFile('index.html')
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
    ipcMain.handle('ping', () => 'pong')
    createWindow()

    // macOS
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
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
                category_id
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
 * Params: { group: number, categories: number[] }
 * Returns: questions for that age group & any of the categories,
 *           excluding the correct_answer field.
 */
ipcMain.handle('startGame', async (event, {group, categories}) => {
    try {
        if (!Array.isArray(categories) || categories.length === 0) {
            throw new Error('categories must be a non-empty array');
        }

        const {data, error} = await supabase
            .from('Questions')
            .select('id, text, answers, image_path, category_id')
            .eq('age_group_id', group)
            .in('category_id', categories);

        if (error) throw error;

        const questions = data.map((q) => ({
            id: q.id,
            text: q.text,
            options: q.answers,
            image_path: q.image_path,
            category_id: q.category_id,
        }));

        return questions;
    } catch (err) {
        return {error: err.message};
    }
});


/**
 * answer
 * Params: { questionId: number, selectedIndex: number }
 * Returns: { correct: boolean }
 */
ipcMain.handle('answer', async (event, {questionId, selectedIndex}) => {
    try {
        const {data, error} = await supabase
            .from('Questions')
            .select('correct_answer')
            .eq('id', questionId)
            .single();

        if (error) throw error;

        const correct = data.correct_answer === selectedIndex;
        return {correct};
    } catch (err) {
        return {error: err.message};
    }
});
