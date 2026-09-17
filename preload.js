const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tliDB", {
  isElectron:      true,
  saveOffer:       (offer)           => ipcRenderer.invoke("db:saveOffer",    offer),
  getOffers:       (filters)         => ipcRenderer.invoke("db:getOffers",    filters),
  getOffer:        (id)              => ipcRenderer.invoke("db:getOffer",     id),
  deleteOffer:     (id)              => ipcRenderer.invoke("db:deleteOffer",  id),
  updateStatus:    (id, status)      => ipcRenderer.invoke("db:updateStatus", {id, status}),
  setPrice:        (sid, price, note)=> ipcRenderer.invoke("db:setPrice",     {service_id:sid, price, note}),
  getPrices:       ()                => ipcRenderer.invoke("db:getPrices"),
  getPriceHistory: (sid)             => ipcRenderer.invoke("db:getPriceHistory", sid),
  getSetting:      (key)             => ipcRenderer.invoke("db:getSetting",   key),
  setSetting:      (key, val)        => ipcRenderer.invoke("db:setSetting",   {key, val}),
  getStats:        ()                => ipcRenderer.invoke("db:getStats"),
  getDBPath:       ()                => ipcRenderer.invoke("db:getPath"),
});
