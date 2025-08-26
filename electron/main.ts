// electron/main.ts
import installExtension, {
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ... (keep the rest of the path setup as is)
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;
let win: BrowserWindow | null;
// ...

function createWindow() {
  // ... (keep this function as is)
  win = new BrowserWindow({
    width: 1920,
    height: 1080,
    alwaysOnTop: false,
    frame: false,
    resizable: true,
    transparent: true,
    minimizable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });
  win.setMenu(null);
  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// --- Database Setup ---
const dbPath = path.join(app.getPath("userData"), "secure.db");
let db: SqliteDatabase; // 👈 FIX: Explicitly type the database instance

function setupDatabase() {
  db = new Database(dbPath, {
    verbose: console.log,
    nativeBinding: require.resolve("@journeyapps/sqlcipher"),
  });
  const encryptionKey = "a-very-secret-key";
  db.pragma(`KEY = '${encryptionKey}'`);
  const createTableStmt = `
    CREATE TABLE IF NOT EXISTS identity_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_bundle TEXT NOT NULL
    );
  `;
  db.exec(createTableStmt);
  console.log("✅ Secure database initialized.");
}

app.whenReady().then(() => {
  setupDatabase();

  // --- IPC Handlers for Database ---
  ipcMain.handle("db:save-keys", (_event, keyBundle) => {
    // 👈 FIX: Underscore for unused event
    const stmt = db.prepare(
      "INSERT INTO identity_keys (key_bundle) VALUES (?)"
    );
    stmt.run(JSON.stringify(keyBundle));
    console.log("✅ Keys saved to secure database.");
    return { success: true };
  });

  ipcMain.handle("db:get-keys", (_event) => {
    // 👈 FIX: Underscore for unused event
    const stmt = db.prepare(
      "SELECT key_bundle FROM identity_keys ORDER BY id DESC LIMIT 1"
    );
    const result = stmt.get();
    if (result) {
      console.log("✅ Keys retrieved from secure database.");
      return JSON.parse((result as { key_bundle: string }).key_bundle);
    }
    return null;
  });

  // ... (keep the rest of the app.whenReady block as is)
  installExtension(REACT_DEVELOPER_TOOLS)
    .then((name) => {
      console.log(`Added Extension:  ${name}`);
      createWindow();
    })
    .catch((err) => {
      console.log("An error occurred: ", err);
      createWindow();
    });
});

// ... (keep the window-all-closed and activate event handlers as is)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
