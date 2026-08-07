import assert from "node:assert/strict";
import sql from "mssql";
import { getPool } from "../database/connection";

export type CompositeFkExpectation = {
  fkName: string;
  childTable: string;
  childCompanyColumn: string;
  childForeignColumn: string;
  parentTable: string;
  parentCompanyColumn: string;
  parentIdColumn: string;
};

export type UniqueKeyExpectation = {
  indexName: string;
  table: string;
  columns: readonly [string, string];
};

/**
 * Asserts a composite FK maps (company_id, foreign_id) → (company_id, id)
 * using sys.foreign_keys / sys.foreign_key_columns / sys.columns (not name-only).
 */
export const assertCompositeFkMetadata = async (
  expectation: CompositeFkExpectation,
): Promise<void> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("fkName", sql.NVarChar(256), expectation.fkName)
    .query(`
      SELECT
        OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
        OBJECT_NAME(fk.parent_object_id) AS child_table,
        pc.name AS child_column,
        fkc.constraint_column_id AS column_ordinal,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
        OBJECT_NAME(fk.referenced_object_id) AS parent_table,
        rc.name AS parent_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      INNER JOIN sys.columns pc
        ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      INNER JOIN sys.columns rc
        ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
      WHERE fk.name = @fkName
      ORDER BY fkc.constraint_column_id ASC
    `);

  assert.equal(
    result.recordset.length,
    2,
    `${expectation.fkName}: expected exactly 2 FK columns, got ${result.recordset.length}`,
  );

  const [col1, col2] = result.recordset as Array<{
    child_table: string;
    child_column: string;
    parent_table: string;
    parent_column: string;
    column_ordinal: number;
  }>;

  assert.equal(col1.child_table, expectation.childTable, `${expectation.fkName} child table`);
  assert.equal(col2.child_table, expectation.childTable, `${expectation.fkName} child table`);
  assert.equal(col1.parent_table, expectation.parentTable, `${expectation.fkName} parent table`);
  assert.equal(col2.parent_table, expectation.parentTable, `${expectation.fkName} parent table`);

  assert.equal(col1.column_ordinal, 1);
  assert.equal(col2.column_ordinal, 2);

  assert.equal(
    col1.child_column,
    expectation.childCompanyColumn,
    `${expectation.fkName}: child col1 must be ${expectation.childCompanyColumn}`,
  );
  assert.equal(
    col2.child_column,
    expectation.childForeignColumn,
    `${expectation.fkName}: child col2 must be ${expectation.childForeignColumn}`,
  );
  assert.equal(
    col1.parent_column,
    expectation.parentCompanyColumn,
    `${expectation.fkName}: parent col1 must be ${expectation.parentCompanyColumn}`,
  );
  assert.equal(
    col2.parent_column,
    expectation.parentIdColumn,
    `${expectation.fkName}: parent col2 must be ${expectation.parentIdColumn}`,
  );
};

/** Asserts a unique index exists with exactly the expected column order. */
export const assertUniqueKeyColumns = async (
  expectation: UniqueKeyExpectation,
): Promise<void> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("indexName", sql.NVarChar(256), expectation.indexName)
    .input("table", sql.NVarChar(256), expectation.table)
    .query(`
      SELECT c.name AS column_name, ic.key_ordinal
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE i.name = @indexName
        AND i.object_id = OBJECT_ID(@table)
        AND i.is_unique = 1
        AND ic.is_included_column = 0
      ORDER BY ic.key_ordinal ASC
    `);

  assert.ok(
    result.recordset.length >= expectation.columns.length,
    `${expectation.indexName} on ${expectation.table}: unique index missing or incomplete`,
  );

  for (let i = 0; i < expectation.columns.length; i += 1) {
    assert.equal(
      String(result.recordset[i].column_name),
      expectation.columns[i],
      `${expectation.indexName}: column ${i + 1} mismatch`,
    );
  }
};
