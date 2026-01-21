import snowflake from "snowflake-sdk";

// Configure Snowflake SDK to not check OCSP (common in serverless environments)
snowflake.configure({ ocspFailOpen: true });

interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
  schema: string;
}

function getConfig(): SnowflakeConfig {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT || "",
    username: process.env.SNOWFLAKE_USER || "",
    password: process.env.SNOWFLAKE_PASSWORD || "",
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || "",
    database: process.env.SNOWFLAKE_DATABASE || "",
    schema: process.env.SNOWFLAKE_SCHEMA || "",
  };
}

function createConnection(): snowflake.Connection {
  const config = getConfig();
  return snowflake.createConnection({
    account: config.account,
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
  });
}

export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const connection = createConnection();

    connection.connect((err) => {
      if (err) {
        reject(new Error(`Connection failed: ${err.message}`));
        return;
      }

      connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          // Always destroy connection after query
          connection.destroy((destroyErr) => {
            if (destroyErr) {
              console.error("Error destroying connection:", destroyErr);
            }
          });

          if (err) {
            reject(new Error(`Query failed: ${err.message}`));
            return;
          }

          resolve((rows || []) as T[]);
        },
      });
    });
  });
}

export async function execute(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<{ rowsAffected: number }> {
  return new Promise((resolve, reject) => {
    const connection = createConnection();

    connection.connect((err) => {
      if (err) {
        reject(new Error(`Connection failed: ${err.message}`));
        return;
      }

      connection.execute({
        sqlText,
        binds,
        complete: (err, stmt) => {
          // Always destroy connection after query
          connection.destroy((destroyErr) => {
            if (destroyErr) {
              console.error("Error destroying connection:", destroyErr);
            }
          });

          if (err) {
            reject(new Error(`Execute failed: ${err.message}`));
            return;
          }

          resolve({ rowsAffected: stmt?.getNumUpdatedRows() || 0 });
        },
      });
    });
  });
}

// Convenience function to get all records from a table
export async function getAll<T = Record<string, unknown>>(
  tableName: string
): Promise<T[]> {
  return query<T>(`SELECT * FROM ${tableName}`);
}

// Convenience function to get one record by ID
export async function getById<T = Record<string, unknown>>(
  tableName: string,
  idColumn: string,
  id: string | number
): Promise<T | null> {
  const rows = await query<T>(
    `SELECT * FROM ${tableName} WHERE ${idColumn} = ?`,
    [id]
  );
  return rows[0] || null;
}
