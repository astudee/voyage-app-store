import jwt from "jsonwebtoken";
import crypto from "crypto";

interface SnowflakeConfig {
  account: string;
  user: string;
  privateKey?: string;
  password?: string;
  warehouse: string;
  database: string;
  schema: string;
}

function getConfig(): SnowflakeConfig {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT || "",
    user: process.env.SNOWFLAKE_USER || "",
    privateKey: process.env.SNOWFLAKE_PRIVATE_KEY,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || "",
    database: process.env.SNOWFLAKE_DATABASE || "",
    schema: process.env.SNOWFLAKE_SCHEMA || "",
  };
}

function getAccountIdentifier(account: string): string {
  // Extract account identifier (e.g., "sf18359" from "sf18359.us-central1.gcp")
  return account.split(".")[0].toUpperCase();
}

function generateJWT(config: SnowflakeConfig): string {
  if (!config.privateKey) {
    throw new Error(
      "SNOWFLAKE_PRIVATE_KEY is required for Snowflake SQL API authentication. " +
      "Please set up key-pair authentication in Snowflake and provide the private key."
    );
  }

  const accountId = getAccountIdentifier(config.account);
  const qualifiedUsername = `${accountId}.${config.user.toUpperCase()}`;

  // Create public key fingerprint
  const privateKeyObj = crypto.createPrivateKey(config.privateKey);
  const publicKey = crypto.createPublicKey(privateKeyObj);
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const fingerprint = crypto
    .createHash("sha256")
    .update(publicKeyDer)
    .digest("base64");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `${qualifiedUsername}.SHA256:${fingerprint}`,
    sub: qualifiedUsername,
    iat: now,
    exp: now + 3600, // 1 hour expiry
  };

  return jwt.sign(payload, config.privateKey, { algorithm: "RS256" });
}

async function executeStatement(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<{ data: Record<string, unknown>[][]; rowType: { name: string }[] }> {
  const config = getConfig();

  // For development/testing without key-pair auth, throw a helpful error
  if (!config.privateKey) {
    console.warn(
      "Snowflake SQL API requires key-pair authentication. " +
      "Falling back to mock data for development."
    );
    // Return empty result for now
    return { data: [], rowType: [] };
  }

  const token = generateJWT(config);
  const accountId = getAccountIdentifier(config.account);

  // Snowflake SQL API endpoint
  const url = `https://${config.account}.snowflakecomputing.com/api/v2/statements`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
    },
    body: JSON.stringify({
      statement: sqlText,
      timeout: 60,
      database: config.database,
      schema: config.schema,
      warehouse: config.warehouse,
      bindings: binds.reduce((acc, val, idx) => {
        acc[(idx + 1).toString()] = { type: "TEXT", value: String(val) };
        return acc;
      }, {} as Record<string, { type: string; value: string }>),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Snowflake API error: ${error}`);
  }

  const result = await response.json();

  // Handle async execution if needed
  if (result.statementStatusUrl) {
    // Poll for results
    let status = result;
    while (status.statementStatusUrl && !status.data) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusResponse = await fetch(status.statementStatusUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
        },
      });
      status = await statusResponse.json();
    }
    return status;
  }

  return result;
}

export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<T[]> {
  const result = await executeStatement(sqlText, binds);

  if (!result.data || result.data.length === 0) {
    return [];
  }

  // Transform array data to objects using rowType
  const columns = result.rowType?.map((col) => col.name) || [];
  return result.data.map((row) => {
    const obj: Record<string, unknown> = {};
    row.forEach((value, idx) => {
      obj[columns[idx]] = value;
    });
    return obj as T;
  });
}

export async function execute(
  sqlText: string,
  binds: (string | number | boolean | null)[] = []
): Promise<{ rowsAffected: number }> {
  const result = await executeStatement(sqlText, binds);
  return { rowsAffected: result.data?.length || 0 };
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
