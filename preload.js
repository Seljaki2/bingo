const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    getAgeGroups: async () => {
        return ipcRenderer.invoke('get-age-groups');
    },
});