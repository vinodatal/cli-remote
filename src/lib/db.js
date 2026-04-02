const Database = require("better-sqlite3");
const { SESSION_STORE_PATH } = require("./config");

let overridePath = null;
let overrideOpts = null;

function setDbOverride(dbPath, opts) {
    overridePath = dbPath;
    overrideOpts = opts;
}

function getDb() {
    if (overridePath) {
        return new Database(overridePath, overrideOpts || {});
    }
    return new Database(SESSION_STORE_PATH, { readonly: true, fileMustExist: true });
}

module.exports = { getDb, setDbOverride };
