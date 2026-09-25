import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { get, set } from 'idb-keyval';
import { TelegramChat, TelegramMessage, DatabaseStats } from '../types';

// In browser/Vite environment, resolve WASM URL; in Node.js, sql.js handles WASM natively
const sqlWasmUrl =
  typeof window !== 'undefined'
    ? new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).href
    : undefined;

const DB_STORE_KEY = 'telegram_sqlite_database_binary';

function computeMediaCategory(m: TelegramMessage): string | null {
  const mType = m.media?.type;
  const details = m.media?.details || '';
  const path = m.media?.url || '';
  const stickerFormat = m.media?.stickerFormat || '';
  const text = m.textContent || '';

  if (mType === 'photo') return 'photos';
  if (
    (mType === 'video' && (details.includes('GIF') || details === 'Animation' || path.endsWith('.gif'))) ||
    path.endsWith('.gif') ||
    (mType === 'sticker' && stickerFormat === 'webm')
  ) {
    return 'gifs';
  }
  if (mType === 'video') return 'videos';
  if (mType === 'audio' || mType === 'voice') return 'music';
  if (mType === 'file' || (mType && !['photo', 'video', 'audio', 'voice', 'call', 'sticker'].includes(mType) && path)) {
    return 'files';
  }
  if (
    text.includes('http://') ||
    text.includes('https://') ||
    text.includes('www.') ||
    text.includes('.com') ||
    text.includes('.org') ||
    text.includes('.net') ||
    text.includes('.t.me') ||
    text.includes('t.me/')
  ) {
    return 'links';
  }
  return null;
}

export type MediaCategory = 'photos' | 'videos' | 'gifs' | 'music' | 'files' | 'links';

class SQLiteService {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private isInitialized = false;

  async init(): Promise<boolean> {
    if (this.isInitialized && this.db) return true;

    try {
      this.SQL = await initSqlJs(
        sqlWasmUrl
          ? {
              locateFile: () => sqlWasmUrl,
            }
          : undefined
      );

      // Try loading saved database binary from IndexedDB (browser)
      let savedBinary = null;
      if (typeof window !== 'undefined') {
        try {
          savedBinary = await get<any>(DB_STORE_KEY);
        } catch {
          // ignore
        }
      }

      if (savedBinary) {
        if (savedBinary instanceof ArrayBuffer) {
          savedBinary = new Uint8Array(savedBinary);
        }
        if (savedBinary.length > 0 || savedBinary.byteLength > 0) {
          this.db = new this.SQL.Database(savedBinary);
        } else {
          this.db = new this.SQL.Database();
        }
      } else {
        this.db = new this.SQL.Database();
      }
      this.createSchemaAndMigrate();

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn('Vite asset WASM loader attempt:', err);
      try {
        this.SQL = await initSqlJs(
          typeof window !== 'undefined'
            ? {
                locateFile: () => '/sql-wasm.wasm',
              }
            : undefined
        );
        let savedBinary = null;
        if (typeof window !== 'undefined') {
          try {
            savedBinary = await get<any>(DB_STORE_KEY);
          } catch {
            // ignore
          }
        }
        if (savedBinary) {
          if (savedBinary instanceof ArrayBuffer) {
            savedBinary = new Uint8Array(savedBinary);
          }
          if (savedBinary.length > 0 || savedBinary.byteLength > 0) {
            this.db = new this.SQL.Database(savedBinary);
          } else {
            this.db = new this.SQL.Database();
          }
        } else {
          this.db = new this.SQL.Database();
        }
        this.createSchemaAndMigrate();

        this.isInitialized = true;
        return true;
      } catch (err2) {
        console.error('Failed to initialize SQLite engine:', err2);
        return false;
      }
    }
  }

  private createSchemaAndMigrate() {
    if (!this.db) return;

    this.db.run(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chat_type TEXT DEFAULT 'personal',
        total_messages INTEGER DEFAULT 0,
        last_message TEXT,
        last_date TEXT,
        initials TEXT,
        color_class TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER NOT NULL,
        chat_id TEXT NOT NULL,
        seq INTEGER,
        msg_type TEXT NOT NULL DEFAULT 'default',
        sender_name TEXT,
        sender_initials TEXT,
        sender_color TEXT,
        date_text TEXT,
        time_text TEXT,
        date_day TEXT,
        text_content TEXT,
        reply_to_id INTEGER,
        reply_to_sender TEXT,
        reply_to_text TEXT,
        forward_from TEXT,
        forward_date TEXT,
        media_type TEXT,
        media_path TEXT,
        media_title TEXT,
        media_details TEXT,
        media_duration TEXT,
        media_filesize TEXT,
        sticker_format TEXT,
        source_file TEXT,
        reactions_json TEXT,
        media_category TEXT,
        PRIMARY KEY (chat_id, id)
      );

      CREATE TABLE IF NOT EXISTS media_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        rel_path TEXT UNIQUE,
        file_name TEXT,
        file_type TEXT,
        file_size INTEGER,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_seq ON messages(chat_id, seq);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id_id ON messages(chat_id, id);
      CREATE INDEX IF NOT EXISTS idx_messages_date_text ON messages(chat_id, date_text);
      CREATE INDEX IF NOT EXISTS idx_messages_date_day ON messages(chat_id, date_day);
      CREATE INDEX IF NOT EXISTS idx_messages_media_type ON messages(media_type);
      CREATE INDEX IF NOT EXISTS idx_media_files_rel_path ON media_files(rel_path);
    `);

    // Migration helper for legacy tables loaded from existing IndexedDB sessions
    try {
      const tableInfo = this.db.exec('PRAGMA table_info(messages);');
      if (tableInfo.length > 0 && tableInfo[0].values) {
        const colNames = tableInfo[0].values.map((c: any[]) => c[1] as string);
        if (!colNames.includes('media_category')) {
          this.db.run('ALTER TABLE messages ADD COLUMN media_category TEXT;');
          this.db.run(`
            UPDATE messages
            SET media_category = CASE
              WHEN media_type = 'photo' THEN 'photos'
              WHEN (media_type = 'video' AND (media_details LIKE '%GIF%' OR media_details = 'Animation' OR media_path LIKE '%.gif')) OR (media_path LIKE '%.gif') OR (media_type = 'sticker' AND sticker_format = 'webm') THEN 'gifs'
              WHEN media_type = 'video' THEN 'videos'
              WHEN media_type IN ('audio', 'voice') THEN 'music'
              WHEN media_type = 'file' OR (media_type NOT IN ('photo', 'video', 'audio', 'voice', 'call', 'sticker') AND media_path IS NOT NULL AND media_path != '') THEN 'files'
              WHEN text_content LIKE '%http://%' OR text_content LIKE '%https://%' OR text_content LIKE '%www.%' OR text_content LIKE '%.com%' OR text_content LIKE '%.org%' OR text_content LIKE '%.net%' OR text_content LIKE '%.t.me%' THEN 'links'
              ELSE NULL
            END
            WHERE media_category IS NULL;
          `);
        }
      }
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_media_cat ON messages(media_category);');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_chat_media_cat ON messages(chat_id, media_category);');
    } catch (err) {
      console.warn('Migration check for media_category column:', err);
    }
  }

  private persistDebounceTimeout: any = null;

  debouncedPersist(delayMs = 500): void {
    if (this.persistDebounceTimeout) {
      clearTimeout(this.persistDebounceTimeout);
    }
    this.persistDebounceTimeout = setTimeout(() => {
      this.persistDebounceTimeout = null;
      this.persist();
    }, delayMs);
  }

  async persist(): Promise<void> {
    if (this.persistDebounceTimeout) {
      clearTimeout(this.persistDebounceTimeout);
      this.persistDebounceTimeout = null;
    }
    if (!this.db) return;
    try {
      const data = this.db.export();
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        await set(DB_STORE_KEY, data);
      }
    } catch (err) {
      console.warn('Could not persist SQLite to IndexedDB:', err);
    }
  }

  async clearAllData(): Promise<boolean> {
    return this.resetDatabase();
  }

  // Settings Key-Value storage in SQLite
  getSetting(key: string): string | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
      stmt.bind([key]);
      let val: string | null = null;
      if (stmt.step()) {
        val = stmt.get()[0] as string;
      }
      stmt.free();
      return val;
    } catch {
      return null;
    }
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run([key, value]);
      stmt.free();
      this.debouncedPersist(500);
    } catch (err) {
      console.error('Failed to set setting in SQLite:', err);
    }
  }

  removeSetting(key: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare('DELETE FROM settings WHERE key = ?');
      stmt.run([key]);
      stmt.free();
      this.debouncedPersist(500);
    } catch (err) {
      console.error('Failed to delete setting in SQLite:', err);
    }
  }

  // Insert or update chat metadata
  insertChats(chats: TelegramChat[], autoPersist = true): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chats (id, title, chat_type, total_messages, last_message, last_date, initials, color_class)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      this.db.run('BEGIN TRANSACTION;');
      for (const c of chats) {
        stmt.run([
          c.id,
          c.title,
          c.chatType || 'personal',
          c.totalMessages || 0,
          c.lastMessage || '',
          c.lastDate || '',
          c.initials || '',
          c.colorClass || 'userpic8',
        ]);
      }
      this.db.run('COMMIT;');
      if (autoPersist) {
        this.persist();
      }
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Error inserting chats into SQLite:', err);
    } finally {
      stmt.free();
    }
  }

  // Batch insert messages with transaction for high performance
  insertMessages(messages: TelegramMessage[], autoPersist = false): void {
    if (!this.db || messages.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, chat_id, seq, msg_type, sender_name, sender_initials, sender_color,
        date_text, time_text, date_day, text_content,
        reply_to_id, reply_to_sender, reply_to_text,
        forward_from, forward_date,
        media_type, media_path, media_title, media_details, media_duration, media_filesize, sticker_format,
        source_file, reactions_json, media_category
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    try {
      this.db.run('BEGIN TRANSACTION;');
      for (const m of messages) {
        stmt.run([
          m.id,
          m.chatId,
          m.seq !== undefined ? m.seq : null,
          m.msgType || 'default',
          m.senderName || null,
          m.senderInitials || null,
          m.senderColor || null,
          m.dateText || null,
          m.timeText || null,
          m.dateDay || null,
          m.textContent || null,
          m.replyTo?.msgId || null,
          m.replyTo?.sender || null,
          m.replyTo?.text || null,
          m.forwardInfo?.from || null,
          m.forwardInfo?.date || null,
          m.media?.type || null,
          m.media?.url || null,
          m.media?.title || null,
          m.media?.details || null,
          m.media?.duration || null,
          m.media?.fileSize || null,
          m.media?.stickerFormat || null,
          m.sourceFile || null,
          m.reactions ? JSON.stringify(m.reactions) : null,
          computeMediaCategory(m),
        ]);
      }
      this.db.run('COMMIT;');
      if (autoPersist) {
        this.persist();
      }
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Error inserting messages into SQLite:', err);
    } finally {
      stmt.free();
    }
  }

  // Insert detected media files
  insertMediaFiles(files: { chatId?: string; relPath: string; fileName: string; fileType: string; fileSize?: number }[], autoPersist = true): void {
    if (!this.db || files.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO media_files (chat_id, rel_path, file_name, file_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `);

    try {
      this.db.run('BEGIN TRANSACTION;');
      for (const f of files) {
        stmt.run([
          f.chatId || null,
          f.relPath,
          f.fileName,
          f.fileType,
          f.fileSize || 0,
        ]);
      }
      this.db.run('COMMIT;');
      if (autoPersist) {
        this.persist();
      }
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Error inserting media files into SQLite:', err);
    } finally {
      stmt.free();
    }
  }

  // Retrieve all chats
  getAllChats(): TelegramChat[] {
    if (!this.db) return [];
    try {
      const res = this.db.exec(`
        SELECT id, title, chat_type, total_messages, last_message, last_date, initials, color_class
        FROM chats
        ORDER BY id ASC
      `);

      if (!res.length || !res[0].values) return [];

      return res[0].values.map((row: any[]) => ({
        id: row[0] as string,
        title: row[1] as string,
        chatType: (row[2] || 'personal') as any,
        totalMessages: (row[3] as number) || 0,
        lastMessage: (row[4] as string) || '',
        lastDate: (row[5] as string) || '',
        initials: (row[6] as string) || 'TC',
        colorClass: (row[7] as string) || 'userpic8',
      }));
    } catch (err) {
      console.error('Error querying chats:', err);
      return [];
    }
  }

  // Get detected participants with their message counts
  getParticipants(chatId: string): Array<{ name: string; count: number; initials: string; color: string }> {
    if (!this.db || !chatId) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT sender_name, COUNT(*) as cnt, sender_initials, sender_color
        FROM messages
        WHERE chat_id = ? AND sender_name IS NOT NULL AND sender_name != '' AND msg_type != 'service'
        GROUP BY sender_name
        ORDER BY cnt DESC
      `);
      stmt.bind([chatId]);
      const results: Array<{ name: string; count: number; initials: string; color: string }> = [];
      while (stmt.step()) {
        const row = stmt.get();
        const name = (row[0] as string) || '';
        if (name) {
          results.push({
            name,
            count: (row[1] as number) || 0,
            initials: (row[2] as string) || name.slice(0, 2).toUpperCase(),
            color: (row[3] as string) || 'userpic1',
          });
        }
      }
      stmt.free();
      return results;
    } catch (err) {
      console.error('Error getting chat participants:', err);
      return [];
    }
  }

  // Conversation Perspective identity getters/setters in settings
  getPerspectiveIdentity(chatId?: string): string | null {
    if (chatId) {
      try {
        const local = localStorage.getItem(`tav_perspective_${chatId}`);
        if (local !== null) return local === '' ? null : local;
      } catch {}
      const chatSpecific = this.getSetting(`perspective_identity_${chatId}`);
      if (chatSpecific) return chatSpecific;
    }
    try {
      const localGlobal = localStorage.getItem('tav_perspective_global');
      if (localGlobal !== null) return localGlobal === '' ? null : localGlobal;
    } catch {}
    return this.getSetting('perspective_identity') || null;
  }

  setPerspectiveIdentity(first: string | null, second?: string | null): void {
    if (first === null || second === null) {
      const targetChatId = first !== null ? first : second;
      if (targetChatId) {
        this.removeSetting(`perspective_identity_${targetChatId}`);
        try {
          localStorage.removeItem(`tav_perspective_${targetChatId}`);
        } catch {}
      }
      this.removeSetting('perspective_identity');
      try {
        localStorage.removeItem('tav_perspective_global');
      } catch {}
      this.persist();
      return;
    }
    if (second !== undefined) {
      this.setSetting(`perspective_identity_${second}`, first);
      this.setSetting(`perspective_identity_${first}`, second);
      try {
        localStorage.setItem(`tav_perspective_${second}`, first);
        localStorage.setItem(`tav_perspective_${first}`, second);
      } catch {}
    }
    this.setSetting('perspective_identity', first);
    try {
      localStorage.setItem('tav_perspective_global', first);
    } catch {}
    this.persist();
  }

  // Total message count for a specific chat
  getMessageCount(chatId: string): number {
    if (!this.db || !chatId) return 0;
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) FROM messages WHERE chat_id = ?');
      stmt.bind([chatId]);
      let count = 0;
      if (stmt.step()) {
        count = stmt.get()[0] as number;
      }
      stmt.free();
      return count;
    } catch {
      return 0;
    }
  }

  // Find zero-based chronological index of a specific message ID in chat
  getMessageIndex(chatId: string, msgId: number): number {
    if (!this.db) return -1;
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) FROM messages
        WHERE chat_id = ? AND seq < (
          SELECT seq FROM messages WHERE chat_id = ? AND id = ? ORDER BY seq ASC LIMIT 1
        )
      `);
      stmt.bind([chatId, chatId, msgId]);
      let idx = -1;
      if (stmt.step()) {
        const val = stmt.get()[0];
        idx = val !== undefined && val !== null ? (val as number) : -1;
      }
      stmt.free();
      return idx;
    } catch {
      return -1;
    }
  }

  private mapRowToMessage(row: any[]): TelegramMessage {
    const mediaType = row[15] as any;
    const mediaPath = row[16] as string;

    return {
      id: row[0] as number,
      chatId: row[1] as string,
      msgType: (row[2] || 'default') as any,
      senderName: (row[3] as string) || undefined,
      senderInitials: (row[4] as string) || undefined,
      senderColor: (row[5] as string) || undefined,
      dateText: (row[6] as string) || undefined,
      timeText: (row[7] as string) || undefined,
      dateDay: (row[8] as string) || undefined,
      textContent: (row[9] as string) || undefined,
      replyTo: row[10]
        ? {
            msgId: row[10] as number,
            sender: (row[11] as string) || undefined,
            text: (row[12] as string) || undefined,
          }
        : undefined,
      forwardInfo: row[13]
        ? {
            from: row[13] as string,
            date: (row[14] as string) || '',
          }
        : undefined,
      media: mediaType
        ? {
            type: mediaType,
            url: mediaPath || undefined,
            title: (row[17] as string) || undefined,
            details: (row[18] as string) || undefined,
            duration: (row[19] as string) || undefined,
            fileSize: (row[20] as string) || undefined,
            stickerFormat: (row[21] as any) || undefined,
          }
        : undefined,
      sourceFile: (row[22] as string) || undefined,
      reactions: row[23] ? JSON.parse(row[23] as string) : undefined,
      seq: row[24] !== undefined && row[24] !== null ? (row[24] as number) : undefined,
    };
  }

  // Keyset / Offset chunked query for lazy loading in virtual scroll
  getMessagesChunk(chatId: string, offset: number, limit: number): TelegramMessage[] {
    if (!this.db || !chatId || limit <= 0) return [];
    try {
      const query = `
        SELECT
          id, chat_id, msg_type, sender_name, sender_initials, sender_color,
          date_text, time_text, date_day, text_content,
          reply_to_id, reply_to_sender, reply_to_text,
          forward_from, forward_date,
          media_type, media_path, media_title, media_details, media_duration, media_filesize, sticker_format,
          source_file, reactions_json, seq
        FROM messages
        WHERE chat_id = ?
        ORDER BY seq ASC
        LIMIT ? OFFSET ?
      `;

      const stmt = this.db.prepare(query);
      stmt.bind([chatId, limit, Math.max(0, offset)]);

      const list: TelegramMessage[] = [];
      while (stmt.step()) {
        list.push(this.mapRowToMessage(stmt.get()));
      }
      stmt.free();
      return list;
    } catch (err) {
      console.error('Error fetching message chunk from SQLite:', err);
      return [];
    }
  }

  // Fast search across messages in SQLite with B-Tree indexes
  searchMessages(searchTerm: string, chatId?: string, limit = 2000): TelegramMessage[] {
    if (!this.db || !searchTerm.trim()) return [];
    try {
      const q = `%${searchTerm.trim()}%`;
      let sql = `
        SELECT
          id, chat_id, msg_type, sender_name, sender_initials, sender_color,
          date_text, time_text, date_day, text_content,
          reply_to_id, reply_to_sender, reply_to_text,
          forward_from, forward_date,
          media_type, media_path, media_title, media_details, media_duration, media_filesize, sticker_format,
          source_file, reactions_json, seq
        FROM messages
        WHERE msg_type != 'service'
          AND (text_content LIKE ? OR sender_name LIKE ? OR media_title LIKE ?)
      `;
      const params: any[] = [q, q, q];
      if (chatId) {
        sql += ' AND chat_id = ? ORDER BY seq ASC LIMIT ?';
        params.push(chatId, limit);
      } else {
        sql += ' ORDER BY chat_id ASC, seq ASC LIMIT ?';
        params.push(limit);
      }

      const stmt = this.db.prepare(sql);
      stmt.bind(params);

      const list: TelegramMessage[] = [];
      while (stmt.step()) {
        list.push(this.mapRowToMessage(stmt.get()));
      }
      stmt.free();
      return list;
    } catch (err) {
      console.error('Error executing SQLite search:', err);
      return [];
    }
  }

  // Get distinct dates with message counts for calendar navigation
  getDateDistribution(chatId?: string): { dateKey: string; displayDate: string; count: number; year: number }[] {
    if (!this.db) return [];
    try {
      let sql = `
        SELECT date_day, date_text, COUNT(*) as count
        FROM messages
        WHERE date_day IS NOT NULL AND date_day != ''
      `;
      const params: any[] = [];
      if (chatId) {
        sql += ' AND chat_id = ?';
        params.push(chatId);
      }
      sql += ' GROUP BY date_day ORDER BY MIN(seq) ASC';

      const stmt = this.db.prepare(sql);
      stmt.bind(params);

      const list: { dateKey: string; displayDate: string; count: number; year: number }[] = [];
      while (stmt.step()) {
        const row = stmt.get();
        const dateDay = (row[0] as string) || '';
        const dateText = (row[1] as string) || '';
        const count = (row[2] as number) || 0;

        let dateKey = '';
        let year = new Date().getFullYear();

        // Try extracting YYYY-MM-DD from date_text (e.g. 2024-03-12 14:22:00)
        const mIso = dateText.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (mIso) {
          const y = parseInt(mIso[1], 10);
          const m = parseInt(mIso[2], 10);
          const d = parseInt(mIso[3], 10);
          dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          year = y;
        } else {
          const parsed = new Date(dateDay);
          if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = parsed.getMonth() + 1;
            const d = parsed.getDate();
            dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            year = y;
          }
        }

        if (dateKey) {
          list.push({
            dateKey,
            displayDate: dateDay,
            count,
            year,
          });
        }
      }
      stmt.free();
      return list;
    } catch (err) {
      console.error('Error querying date distribution:', err);
      return [];
    }
  }

  // Fast query for distinct matching chat IDs on a specific date
  getMatchingChatIdsForDate(dateKey: string, filterQuery?: string): string[] {
    if (!this.db || !dateKey) return [];
    try {
      const minDate = `${dateKey} 00:00:00`;
      const maxDate = `${dateKey} 23:59:59`;

      let sql = `
        SELECT DISTINCT chat_id
        FROM messages
        WHERE (
          (date_text >= ? AND date_text <= ?)
          OR date_day = ?
        )
      `;
      const params: any[] = [minDate, maxDate, dateKey];

      if (filterQuery && filterQuery.trim()) {
        const q = `%${filterQuery.trim()}%`;
        sql += ' AND (text_content LIKE ? OR sender_name LIKE ? OR media_title LIKE ?)';
        params.push(q, q, q);
      }

      const stmt = this.db.prepare(sql);
      stmt.bind(params);

      const chatIds: string[] = [];
      while (stmt.step()) {
        const row = stmt.get();
        if (row[0]) chatIds.push(row[0] as string);
      }
      stmt.free();
      return chatIds;
    } catch (err) {
      console.error('Error getting matching chat IDs for date:', err);
      return [];
    }
  }

  // Incremental date search with LIMIT/OFFSET (LIMIT 6 requested to detect if More exists without COUNT)
  getMessagesByDate(
    dateKey: string,
    chatId?: string,
    filterQuery?: string,
    offset = 0,
    limit = 6
  ): { messages: TelegramMessage[]; hasMore: boolean } {
    if (!this.db || !dateKey) return { messages: [], hasMore: false };
    try {
      const minDate = `${dateKey} 00:00:00`;
      const maxDate = `${dateKey} 23:59:59`;

      let sql = `
        SELECT
          id, chat_id, msg_type, sender_name, sender_initials, sender_color,
          date_text, time_text, date_day, text_content,
          reply_to_id, reply_to_sender, reply_to_text,
          forward_from, forward_date,
          media_type, media_path, media_title, media_details, media_duration, media_filesize, sticker_format,
          source_file, reactions_json, seq
        FROM messages
        WHERE (
          (date_text >= ? AND date_text <= ?)
          OR date_day = ?
        )
      `;
      const params: any[] = [minDate, maxDate, dateKey];

      if (chatId) {
        sql += ' AND chat_id = ?';
        params.push(chatId);
      }

      if (filterQuery && filterQuery.trim()) {
        const q = `%${filterQuery.trim()}%`;
        sql += ' AND (text_content LIKE ? OR sender_name LIKE ? OR media_title LIKE ?)';
        params.push(q, q, q);
      }

      sql += ' ORDER BY seq ASC LIMIT ? OFFSET ?';
      params.push(limit, Math.max(0, offset));

      const stmt = this.db.prepare(sql);
      stmt.bind(params);

      const list: TelegramMessage[] = [];
      while (stmt.step()) {
        list.push(this.mapRowToMessage(stmt.get()));
      }
      stmt.free();

      const pageSize = limit > 1 ? limit - 1 : limit;
      const hasMore = list.length > pageSize;
      const messages = hasMore ? list.slice(0, pageSize) : list;

      return { messages, hasMore };
    } catch (err) {
      console.error('Error querying messages by date:', err);
      return { messages: [], hasMore: false };
    }
  }

  // Get comprehensive database stats with accurate implementation details
  getStats(): DatabaseStats {
    if (!this.db) {
      return {
        dbPath: 'In-Memory SQLite (IndexedDB Persistence)',
        journalMode: 'MEMORY',
        fileSizeMb: 0,
        totalChats: 0,
        totalMessages: 0,
        totalMediaFiles: 0,
        ftsIndexed: false,
      };
    }

    try {
      const chatsRes = this.db.exec('SELECT COUNT(*) FROM chats');
      const totalChats = (chatsRes[0]?.values[0]?.[0] as number) || 0;

      const msgsRes = this.db.exec('SELECT COUNT(*) FROM messages');
      const totalMessages = (msgsRes[0]?.values[0]?.[0] as number) || 0;

      const mediaRes = this.db.exec('SELECT COUNT(*) FROM media_files');
      const totalMediaFiles = (mediaRes[0]?.values[0]?.[0] as number) || 0;

      const exported = this.db.export();
      const fileSizeMb = parseFloat((exported.byteLength / (1024 * 1024)).toFixed(2));

      return {
        dbPath: 'In-Memory SQLite (IndexedDB Persistence)',
        journalMode: 'MEMORY',
        fileSizeMb,
        totalChats,
        totalMessages,
        totalMediaFiles,
        ftsIndexed: false,
      };
    } catch {
      return {
        dbPath: 'In-Memory SQLite (IndexedDB Persistence)',
        journalMode: 'MEMORY',
        fileSizeMb: 0,
        totalChats: 0,
        totalMessages: 0,
        totalMediaFiles: 0,
        ftsIndexed: false,
      };
    }
  }

  // Comprehensive media category breakdown for Media Browser
  getMediaCategoryBreakdown(chatId?: string): {
    photos: number;
    videos: number;
    gifs: number;
    music: number;
    files: number;
    links: number;
  } {
    if (!this.db) {
      return { photos: 0, videos: 0, gifs: 0, music: 0, files: 0, links: 0 };
    }
    try {
      const whereClause = chatId ? `WHERE chat_id = '${chatId.replace(/'/g, "''")}'` : '';
      const sql = `
        SELECT
          SUM(CASE WHEN media_category = 'photos' THEN 1 ELSE 0 END) as photos,
          SUM(CASE WHEN media_category = 'videos' THEN 1 ELSE 0 END) as videos,
          SUM(CASE WHEN media_category = 'gifs' THEN 1 ELSE 0 END) as gifs,
          SUM(CASE WHEN media_category = 'music' THEN 1 ELSE 0 END) as music,
          SUM(CASE WHEN media_category = 'files' THEN 1 ELSE 0 END) as files,
          SUM(CASE WHEN media_category = 'links' THEN 1 ELSE 0 END) as links
        FROM messages
        ${whereClause}
      `;
      const res = this.db.exec(sql);
      if (res.length > 0 && res[0].values && res[0].values.length > 0) {
        const row = res[0].values[0];
        return {
          photos: (row[0] as number) || 0,
          videos: (row[1] as number) || 0,
          gifs: (row[2] as number) || 0,
          music: (row[3] as number) || 0,
          files: (row[4] as number) || 0,
          links: (row[5] as number) || 0,
        };
      }
    } catch (err) {
      console.error('Error fetching media category breakdown:', err);
    }
    return { photos: 0, videos: 0, gifs: 0, music: 0, files: 0, links: 0 };
  }

  // Query media items by category with pagination, search, and chat filtering
  getMediaItems(
    category: MediaCategory,
    options: {
      chatId?: string;
      limit?: number;
      offset?: number;
      searchQuery?: string;
    } = {}
  ): TelegramMessage[] {
    if (!this.db) return [];
    const { chatId, limit = 50, offset = 0, searchQuery = '' } = options;

    try {
      const conditions: string[] = [];

      if (chatId) {
        conditions.push(`chat_id = '${chatId.replace(/'/g, "''")}'`);
      }

      conditions.push(`media_category = '${category}'`);

      if (searchQuery.trim()) {
        const cleanSearch = searchQuery.trim().replace(/'/g, "''");
        conditions.push(
          `(text_content LIKE '%${cleanSearch}%' OR media_title LIKE '%${cleanSearch}%' OR media_details LIKE '%${cleanSearch}%' OR sender_name LIKE '%${cleanSearch}%' OR media_path LIKE '%${cleanSearch}%')`
        );
      }

      const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `
        SELECT 
          id, chat_id, msg_type, sender_name, sender_initials, sender_color,
          date_text, time_text, date_day, text_content,
          reply_to_id, reply_to_sender, reply_to_text,
          forward_from, forward_date,
          media_type, media_path, media_title, media_details, media_duration, media_filesize, sticker_format,
          source_file, reactions_json, seq
        FROM messages
        ${whereSql}
        ORDER BY seq DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const stmt = this.db.prepare(query);
      const messages: TelegramMessage[] = [];
      while (stmt.step()) {
        messages.push(this.mapRowToMessage(stmt.get()));
      }
      stmt.free();
      return messages;
    } catch (err) {
      console.error(`Error querying media items for category ${category}:`, err);
      return [];
    }
  }

  // Directly query breakdown of media types from SQLite
  getMediaCategoryCounts(): { photos: number; stickers: number; audio: number; videos: number; files: number } {
    if (!this.db) return { photos: 0, stickers: 0, audio: 0, videos: 0, files: 0 };
    try {
      const res = this.db.exec(`
        SELECT
          SUM(CASE WHEN media_type = 'photo' THEN 1 ELSE 0 END),
          SUM(CASE WHEN media_type = 'sticker' THEN 1 ELSE 0 END),
          SUM(CASE WHEN media_type IN ('audio', 'voice') THEN 1 ELSE 0 END),
          SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END),
          SUM(CASE WHEN media_type = 'file' THEN 1 ELSE 0 END)
        FROM messages
      `);
      if (res.length > 0 && res[0].values && res[0].values.length > 0) {
        const row = res[0].values[0];
        return {
          photos: (row[0] as number) || 0,
          stickers: (row[1] as number) || 0,
          audio: (row[2] as number) || 0,
          videos: (row[3] as number) || 0,
          files: (row[4] as number) || 0,
        };
      }
    } catch {
      // ignore
    }
    return { photos: 0, stickers: 0, audio: 0, videos: 0, files: 0 };
  }

  // Rebuild media files index from messages table
  rebuildMediaIndex(): { totalMedia: number; countByCategory: { photos: number; stickers: number; audio: number; videos: number; files: number } } {
    if (!this.db) return { totalMedia: 0, countByCategory: { photos: 0, stickers: 0, audio: 0, videos: 0, files: 0 } };
    try {
      this.db.run('DELETE FROM media_files;');
      this.db.run(`
        INSERT OR IGNORE INTO media_files (chat_id, rel_path, file_name, file_type)
        SELECT 
          chat_id,
          media_path,
          SUBSTR(media_path, INSTR(media_path, '/') + 1),
          media_type
        FROM messages
        WHERE media_path IS NOT NULL AND media_path != '';
      `);
      this.db.run('REINDEX idx_media_files_rel_path;');
      this.db.run('REINDEX idx_messages_media_type;');
      this.persist();

      const counts = this.getMediaCategoryCounts();
      const totalRes = this.db.exec('SELECT COUNT(*) FROM media_files');
      const totalMedia = (totalRes[0]?.values[0]?.[0] as number) || 0;
      return { totalMedia, countByCategory: counts };
    } catch (err) {
      console.error('Failed to rebuild media index:', err);
      return { totalMedia: 0, countByCategory: { photos: 0, stickers: 0, audio: 0, videos: 0, files: 0 } };
    }
  }

  // Clear chat data tables only (chats, messages, media_files, messages_fts)
  async clearChatData(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.run('DELETE FROM messages;');
      this.db.run('DELETE FROM chats;');
      this.db.run('DELETE FROM media_files;');
      try {
        this.db.run('DELETE FROM messages_fts;');
      } catch {
        // ignore
      }
      await this.persist();
      return true;
    } catch (err) {
      console.error('Failed to clear chat data:', err);
      return false;
    }
  }

  // Completely wipe SQLite database and recreate empty database
  async resetDatabase(): Promise<boolean> {
    if (!this.SQL) return false;
    try {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // ignore
        }
      }
      this.db = new this.SQL.Database();
      this.createSchemaAndMigrate();
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        await set(DB_STORE_KEY, this.db.export());
      }
      return true;
    } catch (err) {
      console.error('Failed to reset SQLite database:', err);
      return false;
    }
  }

  // Export raw SQLite binary file
  exportBinary(): Uint8Array | null {
    if (!this.db) return null;
    return this.db.export();
  }
}

export const sqliteService = new SQLiteService();
