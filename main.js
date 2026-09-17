const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");

const ONLINE_URL   = null; // Χωρίς online mode — όλα τοπικά μέσω offline-app.html
const OFFLINE_FILE = path.join(__dirname, "offline-app.html");

let db;
function initDB() {
  try {
    const Database = require("better-sqlite3");
    const dbPath = path.join(app.getPath("userData"), "offers.db");
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT, client_name TEXT, client_afm TEXT, client_email TEXT,
        book_type TEXT, entity_type TEXT, services TEXT,
        total_yr1 REAL, total_yr2 REAL, has_discount INTEGER DEFAULT 0,
        date_issued TEXT, date_valid TEXT, status TEXT DEFAULT 'draft', notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS custom_prices (
        service_id TEXT PRIMARY KEY, price REAL,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id TEXT, old_price REAL, new_price REAL,
        changed_at TEXT DEFAULT (datetime('now','localtime')), note TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT
      );
    `);
    console.log("[DB] Ready:", dbPath);
  } catch(e) { console.error("[DB]", e.message); }
}

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle("db:saveOffer", (_, offer) => {
  try {
    if (offer.id) {
      db.prepare(`UPDATE offers SET ref=?,client_name=?,client_afm=?,client_email=?,
        book_type=?,entity_type=?,services=?,total_yr1=?,total_yr2=?,has_discount=?,
        date_issued=?,date_valid=?,status=?,notes=?,updated_at=datetime('now','localtime')
        WHERE id=?`).run(offer.ref,offer.client_name,offer.client_afm,offer.client_email,
        offer.book_type,offer.entity_type,JSON.stringify(offer.services||[]),
        offer.total_yr1,offer.total_yr2,offer.has_discount?1:0,
        offer.date_issued,offer.date_valid,offer.status||"draft",offer.notes||"",offer.id);
      return { ok:true, id:offer.id };
    } else {
      const r = db.prepare(`INSERT INTO offers
        (ref,client_name,client_afm,client_email,book_type,entity_type,services,
         total_yr1,total_yr2,has_discount,date_issued,date_valid,status,notes)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        offer.ref,offer.client_name,offer.client_afm,offer.client_email,
        offer.book_type,offer.entity_type,JSON.stringify(offer.services||[]),
        offer.total_yr1,offer.total_yr2,offer.has_discount?1:0,
        offer.date_issued,offer.date_valid,offer.status||"draft",offer.notes||"");
      return { ok:true, id:r.lastInsertRowid };
    }
  } catch(e) { return { ok:false, error:e.message }; }
});
ipcMain.handle("db:getOffers", (_, f) => {
  try {
    let q="SELECT * FROM offers", p=[];
    if(f?.status){q+=" WHERE status=?";p.push(f.status);}
    q+=" ORDER BY created_at DESC";
    return db.prepare(q).all(...p).map(r=>({...r,services:JSON.parse(r.services||"[]")}));
  } catch(e){ return []; }
});
ipcMain.handle("db:getOffer",     (_, id)  => { try{ const r=db.prepare("SELECT * FROM offers WHERE id=?").get(id); return r?{...r,services:JSON.parse(r.services||"[]")}:null; }catch(e){return null;} });
ipcMain.handle("db:deleteOffer",  (_, id)  => { try{ db.prepare("DELETE FROM offers WHERE id=?").run(id); return{ok:true}; }catch(e){return{ok:false,error:e.message};} });
ipcMain.handle("db:updateStatus", (_, {id,status}) => { try{ db.prepare("UPDATE offers SET status=?,updated_at=datetime('now','localtime') WHERE id=?").run(status,id); return{ok:true}; }catch(e){return{ok:false};} });
ipcMain.handle("db:setPrice", (_, {service_id,price,note}) => {
  try {
    const old = db.prepare("SELECT price FROM custom_prices WHERE service_id=?").get(service_id);
    db.prepare(`INSERT INTO custom_prices(service_id,price) VALUES(?,?)
      ON CONFLICT(service_id) DO UPDATE SET price=excluded.price,updated_at=datetime('now','localtime')`).run(service_id,price);
    if(old?.price !== price) db.prepare("INSERT INTO price_history(service_id,old_price,new_price,note) VALUES(?,?,?,?)").run(service_id,old?.price??null,price,note||null);
    return{ok:true};
  } catch(e){return{ok:false,error:e.message};}
});
ipcMain.handle("db:getPrices", () => { try{ const rows=db.prepare("SELECT * FROM custom_prices").all(); const m={}; rows.forEach(r=>{m[r.service_id]=r.price;}); return m; }catch(e){return{};} });
ipcMain.handle("db:getPriceHistory", (_, sid) => { try{ return sid ? db.prepare("SELECT * FROM price_history WHERE service_id=? ORDER BY changed_at DESC LIMIT 50").all(sid) : db.prepare("SELECT * FROM price_history ORDER BY changed_at DESC LIMIT 200").all(); }catch(e){return[];} });
ipcMain.handle("db:getSetting",  (_, key)       => { try{ return db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value??null; }catch(e){return null;} });
ipcMain.handle("db:setSetting",  (_, {key,val}) => { try{ db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,val); return{ok:true}; }catch(e){return{ok:false};} });
ipcMain.handle("db:getStats", () => { try{ return { total:db.prepare("SELECT COUNT(*) as n FROM offers").get().n, draft:db.prepare("SELECT COUNT(*) as n FROM offers WHERE status='draft'").get().n, sent:db.prepare("SELECT COUNT(*) as n FROM offers WHERE status='sent'").get().n, accepted:db.prepare("SELECT COUNT(*) as n FROM offers WHERE status='accepted'").get().n, rejected:db.prepare("SELECT COUNT(*) as n FROM offers WHERE status='rejected'").get().n, total_value:db.prepare("SELECT COALESCE(SUM(total_yr1),0) as s FROM offers WHERE status='accepted'").get().s }; }catch(e){return{};} });
ipcMain.handle("db:getPath", () => path.join(app.getPath("userData"),"offers.db"));

// ── WINDOW ────────────────────────────────────────────────────────────────────
const BANNER = `(function(){var b=document.createElement("div");b.textContent="⚠️ Offline — χωρίς internet.";b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;background:#B8922A;color:#fff;font:600 12px system-ui;padding:6px 12px;text-align:center;";document.body&&document.body.appendChild(b);})()`; 

function createWindow() {
  const win = new BrowserWindow({
    width:1400, height:900, minWidth:1000, minHeight:700,
    title:"TLI Γεννήτρια Προσφορών",
    icon: path.join(__dirname,"icon.png"),
    backgroundColor:"#faf9f5",
    webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:false, preload:path.join(__dirname,"preload.js") },
    show:false
  });
  win.once("ready-to-show", ()=>win.show());
  win.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:"deny"};});
  win.loadFile(OFFLINE_FILE);
  return win;
}

Menu.setApplicationMenu(Menu.buildFromTemplate([{
  label:"Αρχείο", submenu:[
    {label:"Επαναφόρτωση", accelerator:"CmdOrCtrl+R", click:(_,win)=>{if(win)win.loadFile(OFFLINE_FILE);}},
    {type:"separator"},
    {label:"Άνοιγμα φακέλου δεδομένων", click:()=>shell.openPath(app.getPath("userData"))},
    {type:"separator"},
    {role:"quit",label:"Έξοδος"}
  ]
}]));

app.whenReady().then(()=>{
  app.setAppUserModelId("gr.tli.offergenerator");
  initDB();
  createWindow();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
