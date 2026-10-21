/** The local preview and background indexer share SQLite. Retry brief contention. */
export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt=0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const message=error instanceof Error?error.message:'';
      if (attempt>=2 || !/SQLITE_BUSY|database is locked|D1_ERROR: Failed to parse body as JSON/i.test(message)) throw error;
      await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
    }
  }
}
