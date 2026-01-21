import snowflake from "snowflake-sdk";

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

async function executeStatement(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<Record<string, unknown>[]> {
  const connection = createConnection();

  return new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) {
        console.error("Snowflake connection error:", err);
        reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
        return;
      }

      connection.execute({
        sqlText,
        binds: binds as snowflake.Binds,
        complete: (err, stmt, rows) => {
          // Destroy connection after query completes
          connection.destroy((destroyErr) => {
            if (destroyErr) {
              console.warn("Error destroying connection:", destroyErr);
            }
          });

          if (err) {
            console.error("Snowflake query error:", err);
            reject(new Error(`Snowflake query failed: ${err.message}`));
            return;
          }

          resolve((rows as Record<string, unknown>[]) || []);
        },
      });
    });
  });
}

export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<T[]> {
  try {
    const rows = await executeStatement(sqlText, binds);
    return rows as T[];
  } catch (error) {
    console.error("Snowflake query error:", error);
    throw error;
  }
}

export async function execute(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<{ rowsAffected: number }> {
  const rows = await executeStatement(sqlText, binds);
  return { rowsAffected: rows.length };
}

export async function getAll<T = Record<string, unknown>>(
  tableName: string
): Promise<T[]> {
  return query<T>(`SELECT * FROM ${tableName}`);
}

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
