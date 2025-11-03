require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron/main')
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
    const { data, error } = await supabase.from('AgeGroups').select('*');
    if (error) return { error: error.message };
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
