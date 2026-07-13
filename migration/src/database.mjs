import mysql from "mysql2";
import { readFile } from "node:fs/promises";

import { requiredString } from "./util.mjs";

function parseProperties(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

async function sourceSettings(environment) {
  if (environment.MIGRATION_LEGACY_PROPERTIES) {
    const properties = parseProperties(
      await readFile(environment.MIGRATION_LEGACY_PROPERTIES, "utf8"),
    );
    return {
      url: requiredString(properties["spring.datasource.url"], "spring.datasource.url"),
      user: requiredString(properties["spring.datasource.username"], "spring.datasource.username"),
      password: requiredString(
        properties["spring.datasource.password"],
        "spring.datasource.password",
      ),
    };
  }

  if (environment.MIGRATION_DATABASE_URL) {
    return {
      url: environment.MIGRATION_DATABASE_URL,
      user: environment.MIGRATION_DB_USER,
      password: environment.MIGRATION_DB_PASSWORD,
    };
  }

  return {
    host: requiredString(environment.MIGRATION_DB_HOST, "MIGRATION_DB_HOST"),
    port: environment.MIGRATION_DB_PORT ?? "3306",
    user: requiredString(environment.MIGRATION_DB_USER, "MIGRATION_DB_USER"),
    password: requiredString(environment.MIGRATION_DB_PASSWORD, "MIGRATION_DB_PASSWORD"),
    database: requiredString(environment.MIGRATION_DB_NAME, "MIGRATION_DB_NAME"),
  };
}

function connectionOptions(settings, environment) {
  let options;
  if (settings.url !== undefined) {
    const parsed = new URL(settings.url.replace(/^jdbc:/, ""));
    if (parsed.protocol !== "mysql:") throw new Error("The migration database URL must use mysql");
    options = {
      host: parsed.hostname,
      port: parsed.port.length === 0 ? 3306 : Number(parsed.port),
      user: settings.user ?? decodeURIComponent(parsed.username),
      password: settings.password ?? decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    };
  } else {
    options = {
      host: settings.host,
      port: Number(settings.port),
      user: settings.user,
      password: settings.password,
      database: settings.database,
    };
  }

  return {
    ...options,
    connectTimeout: 30_000,
    dateStrings: true,
    decimalNumbers: true,
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    ssl: environment.MIGRATION_DB_SSL === "true" ? {} : undefined,
  };
}

export async function openSourceDatabase(environment = process.env) {
  const settings = await sourceSettings(environment);
  const connection = mysql.createConnection(connectionOptions(settings, environment));
  await connection.promise().connect();
  await connection.promise().query("SET SESSION TRANSACTION READ ONLY");
  return connection;
}

export async function closeSourceDatabase(connection) {
  await connection.promise().end();
}

export async function inventoryCeiling(connection) {
  const [rows] = await connection.promise().query("SELECT MAX(id) AS id FROM inventories");
  const value = rows[0]?.id;
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The source inventory ceiling is not a safe integer");
  }
  return parsed;
}

export async function* streamQuery(connection, sql, parameters) {
  const query = connection.query(sql, parameters);
  const stream = query.stream({ highWaterMark: 1_000 });
  for await (const row of stream) yield row;
}
