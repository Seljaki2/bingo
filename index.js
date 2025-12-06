require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu } = require('electron/main');
const path = require('node:path');

const { createClient } = require("@supabase/supabase-js");
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const fs = require('node:fs');
const fsp = require('node:fs').promises;

async function checkTablesExist(tables) {
    const missing = [];
    for (const t of tables) {
        try {
            const res = await supabase.from(t).select('id').limit(1);
            if (res?.error) {
                missing.push(t);
            }
        } catch (e) {
            missing.push(t);
        }
    }
    return missing;
}

async function runMigrationsFromFolder(migrationsDir) {
    const postgres = require('postgres');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');
    const sql = postgres(databaseUrl, { ssl: { rejectUnauthorized: false } });
    try {
        const files = await fsp.readdir(migrationsDir);
        const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

        try {
            await sql.unsafe(`CREATE TABLE IF NOT EXISTS public."_migrations" (
                filename text PRIMARY KEY,
                applied_at timestamptz DEFAULT now()
            );`);
        } catch (e) {
            console.warn('Warning: could not ensure _migrations table exists', e?.message || e);
        }

        let applied = [];
        try {
            const rows = await sql`SELECT filename FROM public."_migrations"`;
            applied = (rows || []).map(r => r.filename);
        } catch (e) {
            console.warn('Warning: could not read applied migrations, proceeding to run all:', e?.message || e);
        }

        for (const file of sqlFiles) {
            const full = path.join(migrationsDir, file);
            let migrationSql = await fsp.readFile(full, 'utf8');
            if (!migrationSql.trim()) continue;

            const adjustedSql = migrationSql.replace(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?/ig, 'CREATE TABLE IF NOT EXISTS');


            try {
                await sql.begin(async (tx) => {
                    await tx.unsafe(adjustedSql);
                    await tx.unsafe('INSERT INTO public."_migrations"(filename) VALUES($1) ON CONFLICT DO NOTHING', [file]);
                });
            } catch (err) {
                if (err && err.code === '42P07') {
                    console.warn('Migration conflict (relation exists), skipping:', file);
                    try {
                        await sql.unsafe('INSERT INTO public."_migrations"(filename) VALUES($1) ON CONFLICT DO NOTHING', [file]);
                    } catch (e) { }
                    continue;
                }
                throw err;
            }
        }
    } finally {
        try { await sql.end({ timeout: 5_000 }); } catch (e) { }
    }
}

async function ensureSchema() {
    const required = ['Questions', 'User', 'Leaderboard', 'AgeGroups', 'Category'];
    const missing = await checkTablesExist(required);
    if (missing.length === 0) {
        try {
            await ensureAgeGroups();
        } catch (e) {
            console.warn('Could not ensure age groups:', e?.message || e);
        }
        return;
    }
    console.warn('Missing tables detected:', missing);
    if (process.env.RUN_MIGRATIONS === 'true') {
        const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.error('Migrations directory not found at', migrationsDir);
            return;
        }
        if (!process.env.DATABASE_URL) {
            console.error('RUN_MIGRATIONS=true but DATABASE_URL is not set. Skipping migrations.');
            return;
        }

        try {
            await runMigrationsFromFolder(migrationsDir);
            const stillMissing = await checkTablesExist(required);
            if (stillMissing.length === 0) console.log('Migrations applied successfully.');
            else console.error('Migrations applied but some tables still missing:', stillMissing);
            try {
                await ensureAgeGroups();
            } catch (e) {
                console.warn('Could not ensure age groups after migrations:', e?.message || e);
            }
        } catch (err) {
            console.error('Migration error:', err);
        }
    } else {
        console.warn('To auto-run migrations set RUN_MIGRATIONS=true and provide DATABASE_URL.');
    }
}

async function ensureAgeGroups() {
    const groups = [
        { name: 'Otroci', min: 5, max: 10 },
        { name: 'Najstniki', min: 11, max: 19 }
    ];
    try {
        for (const g of groups) {
            const { data: found, error: findErr } = await supabase.from('AgeGroups').select('id').eq('age_group', g.name).limit(1).maybeSingle();
            if (findErr) {
                throw findErr;
            }
            if (!found) {
                const { error: insErr } = await supabase.from('AgeGroups').insert({ age_group: g.name, min_age: g.min, max_age: g.max });
                if (insErr) console.warn('Failed inserting age group via Supabase client:', insErr.message || insErr);
            }
        }
        return;
    } catch (e) {
        console.warn('Supabase client insertion failed, falling back to direct SQL if possible:', e?.message || e);
    }

    if (!process.env.DATABASE_URL) {
        throw new Error('No DATABASE_URL available to insert AgeGroups');
    }

    const postgres = require('postgres');
    const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });
    try {
        for (const g of groups) {
            await sql.unsafe(`INSERT INTO public."AgeGroups"(age_group, min_age, max_age)
                SELECT $1, $2, $3
                WHERE NOT EXISTS (SELECT 1 FROM public."AgeGroups" WHERE age_group = $1)`, [g.name, g.min, g.max]);
        }
    } finally {
        try { await sql.end({ timeout: 2000 }); } catch (e) { }
    }
}

let win, add_player_window, add_age_group_window, add_category_window;

const createWindow = () => {
    win = new BrowserWindow({
        width: 800,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.loadFile('index.html');
    // Remove the default application menu for a cleaner window (no tool menu)
    try {
        // Removes menu from this window
        win.removeMenu();
        // Ensure the application menu is unset (cross-platform)
        Menu.setApplicationMenu(null);
    } catch (e) {
        console.warn('Could not remove menu:', e?.message || e);
    }
}

function createAddPlayerWindow() {
    if (add_player_window) return;

    add_player_window = new BrowserWindow({
        width: 500,
        height: 800,
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

function createAddAgeGroupWindow() {
    if (add_age_group_window) return;

    add_age_group_window = new BrowserWindow({
        width: 420,
        height: 500,
        parent: win,
        modal: true,
        resizable: false,
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    add_age_group_window.loadFile('add_age_group.html');
    add_age_group_window.on('closed', () => { add_age_group_window = null; });
}

function createAddCategoryWindow() {
    if (add_category_window) return;

    add_category_window = new BrowserWindow({
        width: 420,
        height: 460,
        parent: win,
        modal: true,
        resizable: false,
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    add_category_window.loadFile('add_category.html');
    add_category_window.on('closed', () => { add_category_window = null; });
}

app.whenReady().then(async () => {
    ipcMain.handle('ping', () => 'pong');
    ipcMain.on('open-add-age-group', () => createAddAgeGroupWindow());
    ipcMain.on('open-add-category', () => createAddCategoryWindow());

    ipcMain.handle('create-age-group', async (_, payload) => {
        try {
            const { data, error } = await supabase.from('AgeGroups').insert({ age_group: payload.age_group, min_age: payload.min_age, max_age: payload.max_age }).select().single();
            if (error) throw error;
            win?.webContents?.send('age-group-added', data);
            add_age_group_window?.close();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('create-category', async (_, payload) => {
        try {
            const { data, error } = await supabase.from('Category').insert({ name: payload.name }).select().single();
            if (error) throw error;
            win?.webContents?.send('category-added', data);
            add_category_window?.close();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-age-group', async (_, id) => {
        try {
            const { error } = await supabase.from('AgeGroups').delete().eq('id', id);
            if (error) throw error;
            win?.webContents?.send('age-group-deleted', id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-category', async (_, id) => {
        try {
            const { error } = await supabase.from('Category').delete().eq('id', id);
            if (error) throw error;
            win?.webContents?.send('category-deleted', id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
    try {
        await ensureSchema();
    } catch (err) {
        console.error('Schema check/migration error:', err);
    }
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
    const { data, error } = await supabase.from('AgeGroups').select('*');
    if (error) return { error: error.message };
    return data;
});

ipcMain.on('open-add-player', () => {
    createAddPlayerWindow();
});

ipcMain.handle('register-player', async (_, player) => {
    try {
        if (!player || !player.username || !player.password) {
            return { success: false, error: 'Missing username or password' };
        }

        const salt = randomBytes(16).toString('hex');
        const derived = scryptSync(player.password, salt, 64).toString('hex');
        const stored = `${salt}:${derived}`;

        const toInsert = { ...player, password: stored };

        const { data, error } = await supabase
            .from('User')
            .insert(toInsert)
            .select()
            .single();
        if (error) throw error;

        const safeData = { ...data };
        if (safeData.password) delete safeData.password;

        win.webContents.send('player-added', safeData);
        add_player_window?.close();
        return { success: true, data: safeData };
    } catch (err) {
        console.error('Error registering player:', err.message || err);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('login-player', async (_, creds) => {
    try {
        if (!creds || !creds.username || !creds.password) {
            return { success: false, error: 'Missing username or password' };
        }

        const { data, error } = await supabase
            .from('User')
            .select('*')
            .eq('username', creds.username)
            .maybeSingle();
        if (error) throw error;

        if (!data) return { success: false, error: 'Invalid username or password' };

        const stored = data.password;
        if (!stored) return { success: false, error: 'Invalid username or password' };

        const [salt, hash] = stored.split(':');
        if (!salt || !hash) return { success: false, error: 'Invalid username or password' };

        const derived = scryptSync(creds.password, salt, 64).toString('hex');
        const match = timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
        if (!match) return { success: false, error: 'Invalid username or password' };

        const safeData = { ...data };
        if (safeData.password) delete safeData.password;

        win.webContents.send('player-added', safeData);
        add_player_window?.close();
        return { success: true, data: safeData };
    } catch (err) {
        console.error('Error logging in player:', err.message || err);
        return { success: false, error: err.message || String(err) };
    }
});

let currentGame = null;

function createBingoBoard() {
    const board = Array.from({ length: 5 }, () => Array(5).fill(false));
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
        const [{ data: ageGroups, error: ageErr }, { data: categories, error: catErr }] = await Promise.all([
            supabase.from('AgeGroups').select('*').order('min_age', { ascending: true }),
            supabase.from('Category').select('*').order('name', { ascending: true }),
        ]);

        if (ageErr) throw ageErr;
        if (catErr) throw catErr;

        return { ageGroups, categories };
    } catch (err) {
        return { error: err.message };
    }
});


/**
 * leaderboard
 * Params: { groups: number[], categories: number[] }
 * Returns: list of leaderboard entries joined with User info
 */
/*
ipcMain.handle('leaderboard', async () => {
    try {
        console.log('Fetching leaderboard data...');
        const [{ data: leaderboardData, error: leaderboardError }, { data: ageGroups, error: ageError }] = await Promise.all([
            supabase
                .from('Leaderboard')
                .select('* , User(first_name, last_name), AgeGroups(age_group)')
                .order('age_group_id', { ascending: true })
                .order('category_id', { ascending: true })
                .order('score', { ascending: false }),
            supabase.from('AgeGroups').select('*').order('min_age', { ascending: true })
        ]);
        console.log('Fetched leaderboard data:', leaderboardData);
        if (leaderboardError) throw leaderboardError;
        if (ageError) throw ageError;

        const grouped = leaderboardData.reduce((acc, entry) => {
            const age = entry.AgeGroups?.age_group || `Age Group ${entry.age_group_id}`;
            const cat = entry.category_id;
            const game = entry.game_id;
            if (!acc[age]) acc[age] = {};
            if (!acc[age][cat]) acc[age][cat] = {};
            if (!acc[age][cat][game]) acc[age][cat][game] = [];
            acc[age][cat][game].push(entry);
            return acc;
        }, {});
        console.log('Grouped leaderboard data:', grouped);
        return { ageGroups, grouped };
    } catch (err) {
        console.error('Error fetching leaderboard:', err.message);
        return { error: err.message };
    }
});
*/
ipcMain.handle('leaderboard', async () => {
    try {
        const [{ data: leaderboardData, error: leaderboardError }, { data: ageGroups, error: ageError }, { data: categories, error: catError }] = await Promise.all([
            supabase
                .from('Leaderboard')
                .select('* , User(first_name, last_name), AgeGroups(age_group)')
                .order('age_group_id', { ascending: true })
                .order('category_id', { ascending: true })
                .order('score', { ascending: false }),
            supabase.from('AgeGroups').select('*').order('min_age', { ascending: true }),
            supabase.from('Category').select('*')
        ]);

        if (leaderboardError) throw leaderboardError;
        if (ageError) throw ageError;
        if (catError) throw catError;

        // Group the data by age_group (text) first, then by category_id, then by game_id
        const grouped = leaderboardData.reduce((acc, entry) => {
            const age = entry.AgeGroups?.age_group || `Age Group ${entry.age_group_id}`;
            const cat = entry.category_id;
            const game = entry.game_id;
            if (!acc[age]) acc[age] = {};
            if (!acc[age][cat]) acc[age][cat] = {};
            if (!acc[age][cat][game]) acc[age][cat][game] = [];
            acc[age][cat][game].push(entry);
            return acc;
        }, {});

        return { ageGroups, categories, grouped };
    } catch (err) {
        console.error('Error fetching leaderboard:', err.message);
        return { error: err.message };
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
            uuid: randomUUID(),
            categories,
            questions,
            players: players.map((user_id, i) => ({
                id: i,
                user_id,
                score: 0,
                correctNum: 0,
                falseNum: 0,
                board: createBingoBoard()
            })),
            currentPlayerIndex: 0,
        };

        return {
            questions,
            players: currentGame.players.map(p => ({
                id: p.id,
                user_id: p.user_id,
                score: p.score,
                correctNum: p.correctNum,
                falseNum: p.falseNum,
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
ipcMain.handle('answer', async (event, { playerId, questionId, selectedIndex, tile }) => {
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

        const { data, error } = await supabase
            .from('Questions')
            .select('correct_answer')
            .eq('id', questionId)
            .single();

        if (error) throw new Error("1");

        const correct = data.correct_answer === selectedIndex;
        let bingo = false;

        if (correct) {
            currentGame.players.find(p => p.id === playerId).score += 10;
            currentGame.players.find(p => p.id === playerId).correctNum += 1;
            // If client provided a specific tile, and it's valid & not yet selected, use it.
            let marked = false;
            if (tile && Number.isInteger(tile.r) && Number.isInteger(tile.c)) {
                const { r, c } = tile;
                if (r >= 0 && r < 5 && c >= 0 && c < 5 && !player.board[r][c]) {
                    player.board[r][c] = true;
                    marked = true;
                }
            }
            // fallback to previous random selection if no valid tile provided or it was occupied
            if (!marked) {
                const pos = selectRandomSquare(player.board);
                if (pos) {
                    const [r, c] = pos;
                    player.board[r][c] = true;
                }
            }

            if (hasBingo(player.board)) {
                bingo = true;
                currentGame.players.find(p => p.id === playerId).score += 100;
            }
        }
        else {
            currentGame.players.find(p => p.id === playerId).falseNum += 1;
        }
        currentGame.currentPlayerIndex =
            (currentGame.currentPlayerIndex + 1) % currentGame.players.length;
        return { correct, bingo, board: player.board };
    } catch (err) {
        console.error(err);
        return { error: err.message };
    }

});

ipcMain.handle('endGame', async () => {
    try {
        if (!currentGame) throw new Error('No game in progress');
        const results = [];
        for (const player of currentGame.players) {
            const { data, error } = await supabase
                .from('Leaderboard')
                .insert({
                    user_id: player.user_id,
                    age_group_id: currentGame.ageGroup,
                    category_id: currentGame.categories[0],
                    score: player.score,
                    correct_num: player.correctNum,
                    false_num: player.falseNum,
                    game_id: currentGame.uuid
                })
                .select()
                .single();
            if (error) throw error;
            results.push(data);
        }

        currentGame = null;
        return results;
    } catch (err) {
        console.error(err);
        return { error: err.message };
    }
});

/**
 * addQuestion
 * Params: question object { age_group_id, category_id, text, answers, correct_answer, image_path }
 * Copies the provided image (if any) into the app `images/` folder and inserts the question into Supabase.
 */
ipcMain.handle('addQuestion', async (event, question) => {
    try {
        if (!question || !question.text) throw new Error('Invalid question payload');

        const imageData = question.image_data || null;

        const payload = {
            text: question.text,
            answers: question.answers,
            correct_answer: question.correct_answer,
            image_path: imageData,
            category_id: question.category_id,
            age_group_id: question.age_group_id
        };

        const { data, error } = await supabase
            .from('Questions')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('addQuestion error', err);
        return { success: false, error: err.message };
    }
});