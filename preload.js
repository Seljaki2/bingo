const { contextBridge, ipcRenderer } = require('electron')

// supabase
const {createClient} = require("@supabase/supabase-js");
import { Database } from './supabase'
const supabase = createClient<Database>(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    ping: () => ipcRenderer.invoke('ping')
})
