package com.riji.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * 本地账本存储。
 *
 * 账本数据以一份 JSON 文档保存到 SQLite 的 ledger_state 表中。
 * SQLite 文件位于 App 私有目录，覆盖安装不会清除；卸载或手动清除 App 数据才会删除。
 * 相比 WebView localStorage，它不依赖 WebView 的存储实现，也不会因为清理浏览器缓存而消失。
 */
public class StorageDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "riji.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "ledger_state";
    private static final int ROW_ID = 1;

    public StorageDb(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE " + TABLE + " (" +
                        "id INTEGER PRIMARY KEY CHECK (id = 1), " +
                        "payload TEXT NOT NULL, " +
                        "updated_at INTEGER NOT NULL" +
                        ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // 当前只有 v1；后续如需拆表/迁移，在这里处理。
    }

    public String load() {
        Cursor cursor = null;
        try {
            SQLiteDatabase db = getReadableDatabase();
            cursor = db.query(TABLE, new String[]{"payload"}, "id = ?",
                    new String[]{String.valueOf(ROW_ID)}, null, null, null);
            if (cursor.moveToFirst()) {
                String payload = cursor.getString(0);
                return payload == null ? "" : payload;
            }
            return "";
        } catch (Exception e) {
            return "";
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    public boolean save(String payload) {
        if (payload == null) return false;
        SQLiteDatabase db = null;
        try {
            db = getWritableDatabase();
            ContentValues values = new ContentValues();
            values.put("id", ROW_ID);
            values.put("payload", payload);
            values.put("updated_at", System.currentTimeMillis());
            db.beginTransaction();
            try {
                long result = db.insertWithOnConflict(
                        TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
                db.setTransactionSuccessful();
                return result != -1;
            } finally {
                db.endTransaction();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public boolean clear() {
        try {
            SQLiteDatabase db = getWritableDatabase();
            db.delete(TABLE, "id = ?", new String[]{String.valueOf(ROW_ID)});
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
