require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')

// supabase
const {createClient} = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })
    win.loadFile('index.html')
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
